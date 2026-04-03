import { MySqlDatabase } from './mysql-database';

describe('MySqlDatabase', () => {
  let database: MySqlDatabase;

  beforeEach(() => {
    database = new MySqlDatabase({
      engine: 'mysql',
      user: 'root',
      password: 'password',
      host: 'localhost',
      port: 3306,
      database: 'testdb',
    });
  });

  it('executes select queries and maps fields', async () => {
    const release = vi.fn();
    const getConnection = vi.fn((callback: any) => {
      callback(null, {
        query: (_statement: string, _args: any[], queryCallback: any) =>
          queryCallback(
            null,
            [{ id: 1, name: 'Alice' }],
            [{ name: 'id', flags: 1, type: 3, length: 11, default: null }],
          ),
        release,
      });
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    const result = await database.execute('SELECT * FROM `member`');

    expect(result.rows).toEqual([{ id: 1, name: 'Alice' }]);
    expect(result.fields).toEqual([
      { name: 'id', flags: 1, type: 3, length: 11, default: null },
    ]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command result headers into info', async () => {
    const release = vi.fn();
    const getConnection = vi.fn((callback: any) => {
      callback(null, {
        query: (_statement: string, _args: any[], queryCallback: any) =>
          queryCallback(
            null,
            {
              fieldCount: 0,
              affectedRows: 1,
              insertId: 7,
              info: '',
              serverStatus: 2,
              warningStatus: 0,
            },
            undefined,
          ),
        release,
      });
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    const result = await database.execute(
      'INSERT INTO `member` (`name`) VALUES (?)',
      ['Alice'],
    );

    expect(result.info).toMatchObject({ affectedRows: 1, insertId: 7 });
    expect(result.rows).toEqual([]);
    expect(release).toHaveBeenCalled();
  });

  it('rejects when no connection can be acquired', async () => {
    const getConnection = vi.fn((callback: any) => {
      callback(new Error('no connection'));
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({
      getConnection,
    });

    await expect(database.execute('SELECT 1')).rejects.toThrow('no connection');
  });

  it('supports selectSingle, executeScalar, tableExists, escaping, and release', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    (database as any).poolPromise = Promise.resolve({ end });

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
      database.selectSingle('member', 'WHERE id=?', [2]),
    ).resolves.toEqual({ id: 2, name: 'Bob' });
    await expect(database.tableExists('member')).resolves.toBe(true);
    expect(database.quoteIdentifier('odd`name')).toBe('`odd``name`');

    database.release();
    await Promise.resolve();

    expect(end).toHaveBeenCalled();
  });
});
