import { PostgresDatabase } from './postgres-database';

let connectMock: any;
let endMock: any;

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    connect: connectMock,
    end: endMock,
  })),
}));

describe('PostgresDatabase', () => {
  let database: PostgresDatabase;

  beforeEach(() => {
    endMock = vi.fn();
    connectMock = vi.fn();
    database = new PostgresDatabase({} as any);
  });

  it('executes select queries and releases the client', async () => {
    const release = vi.fn();
    connectMock.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1 }],
        fields: [{ name: 'id' }],
      }),
      release,
    });

    const result = await database.execute('SELECT 1');

    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.fields).toEqual([{ name: 'id' }]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command results into info', async () => {
    const release = vi.fn();
    connectMock.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'INSERT',
        rowCount: 1,
        rows: [{ id: 7 }],
        fields: [],
      }),
      release,
    });

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

  it('ends the pool on release', () => {
    database.release();
    expect(endMock).toHaveBeenCalled();
  });
});
