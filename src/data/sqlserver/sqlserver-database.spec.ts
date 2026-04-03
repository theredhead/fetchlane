import { SqlServerDatabase } from './sqlserver-database';

describe('SqlServerDatabase', () => {
  let database: SqlServerDatabase;

  beforeEach(() => {
    database = new SqlServerDatabase({
      user: 'sa',
      password: 'password',
      host: 'localhost',
      port: 1433,
      database: 'master',
    });
  });

  it('executes queries through the pooled request object', async () => {
    const input = vi.fn();
    const query = vi.fn().mockResolvedValue({
      recordset: [{ id: 1 }],
      rowsAffected: [1],
    });
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({ input, query }),
    });

    const result = await database.execute(
      'SELECT * FROM [member] WHERE id=@p1',
      [1],
    );

    expect(input).toHaveBeenCalledWith('p1', 1);
    expect(query).toHaveBeenCalledWith('SELECT * FROM [member] WHERE id=@p1');
    expect(result).toEqual({
      info: { affectedRows: 1, insertId: 1 },
      fields: [],
      rows: [{ id: 1 }],
    });
  });

  it('prefers recordsets when recordset is absent', async () => {
    vi.spyOn(database as any, 'getPool').mockResolvedValue({
      request: () => ({
        input: vi.fn(),
        query: vi.fn().mockResolvedValue({
          recordset: undefined,
          recordsets: [[{ id: 2 }]],
          rowsAffected: [0],
        }),
      }),
    });

    const result = await database.execute('SELECT * FROM [member]');

    expect(result.rows).toEqual([{ id: 2 }]);
  });

  it('supports selectSingle, executeScalar, and tableExists', async () => {
    vi.spyOn(database, 'execute')
      .mockResolvedValueOnce({
        info: {},
        fields: [],
        rows: [{ id: 2, name: 'Bob' }],
      } as any)
      .mockResolvedValueOnce({
        info: {},
        fields: [],
        rows: [{ count: 1 }],
      } as any);

    await expect(
      database.selectSingle('member', 'WHERE id=@p1', [2]),
    ).resolves.toEqual({ id: 2, name: 'Bob' });
    await expect(database.tableExists('member')).resolves.toBe(true);
  });

  it('resets the cached pool when createPool fails so retries can recover', async () => {
    const createPoolSpy = vi
      .spyOn(database as any, 'createPool')
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce({ ok: true });

    await expect((database as any).getPool()).rejects.toThrow('not ready');
    await expect((database as any).getPool()).resolves.toEqual({ ok: true });
    expect(createPoolSpy).toHaveBeenCalledTimes(2);
  });

  it('closes the pool on release and ignores close failures', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close failed'));
    (database as any).poolPromise = Promise.resolve({ close });

    database.release();
    await Promise.resolve();

    expect(close).toHaveBeenCalled();
    expect((database as any).poolPromise).toBeNull();
  });
});
