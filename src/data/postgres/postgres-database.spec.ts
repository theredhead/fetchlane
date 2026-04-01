import { PostgresDatabase } from './postgres-database';

describe('PostgresDatabase', () => {
  let database: PostgresDatabase;

  beforeEach(() => {
    database = new PostgresDatabase({
      engine: 'postgres',
      user: 'postgres',
      password: 'password',
      host: 'localhost',
      port: 5432,
      database: 'testdb',
    });
  });

  it('executes select queries and releases the client', async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1 }],
        fields: [{ name: 'id' }],
      }),
      release,
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({ connect });

    const result = await database.execute('SELECT 1');

    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.fields).toEqual([{ name: 'id' }]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command results into info', async () => {
    const release = vi.fn();
    const connect = vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'INSERT',
        rowCount: 1,
        rows: [{ id: 7 }],
        fields: [],
      }),
      release,
    });
    vi.spyOn(database as any, 'createPool').mockResolvedValue({ connect });

    const result = await database.execute('INSERT ...');

    expect(result.info).toEqual({ affectedRows: 1, insertId: 7 });
    expect(result.rows).toEqual([{ id: 7 }]);
    expect(release).toHaveBeenCalled();
  });

  it('casts table-existence checks to a boolean', async () => {
    vi.spyOn(database, 'executeSingle').mockResolvedValueOnce({
      count: 1,
    } as any);

    await expect(database.tableExists('member')).resolves.toBe(true);
    expect(database.executeSingle).toHaveBeenCalledWith(
      expect.stringContaining('information_schema.tables'),
      ['member'],
    );
  });

  it('escapes identifiers and ends the pool on release', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    (database as any).poolPromise = Promise.resolve({ end });

    expect(database.quoteIdentifier('odd"name')).toBe('"odd""name"');

    database.release();
    await Promise.resolve();

    expect(end).toHaveBeenCalled();
  });
});
