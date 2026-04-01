import { DataAccessService } from './data-access.service';
import { Database, RecordSet } from '../data/database';
import { DatabaseEngine } from '../data/database-engine';

function createDatabaseMock(): Database {
  return {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    selectSingle: vi.fn(),
    execute: vi.fn(),
    executeSingle: vi.fn(),
    executeScalar: vi.fn(),
    tableExists: vi.fn(),
    release: vi.fn(),
  };
}

function createEngineMock(): DatabaseEngine {
  return {
    name: 'test',
    engines: ['test'],
    connectDatabase: vi.fn(),
    quoteIdentifier: vi.fn((name: string) => `"${name}"`),
    parameter: vi.fn((index: number) => `$${index}`),
    paginateQuery: vi.fn(
      (
        baseQuery: string,
        limit: number,
        offset: number,
        orderByClause: string | null,
      ) =>
        [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
          .filter(Boolean)
          .join('\n'),
    ),
    getTableNames: vi.fn(),
    getTableInfo: vi.fn(),
    describeTable: vi.fn(),
    createTableSql: vi.fn(),
  };
}

describe('DataAccessService', () => {
  let db: Database;
  let engine: DatabaseEngine;
  let service: DataAccessService;

  beforeEach(() => {
    db = createDatabaseMock();
    engine = createEngineMock();
    service = new DataAccessService(db, engine);
  });

  it('delegates generic table metadata to the active engine', async () => {
    vi.mocked(engine.getTableNames).mockResolvedValueOnce([
      { table_name: 'member', table_type: 'BASE TABLE' },
    ]);
    vi.mocked(engine.getTableInfo).mockResolvedValueOnce([
      { column_name: 'id' },
    ]);
    vi.mocked(engine.describeTable).mockResolvedValueOnce({
      table_name: 'member',
      table_schema: 'public',
      table_type: 'BASE TABLE',
      columns: [],
      constraints: [],
      indexes: [],
    });

    await expect(service.getTableNames()).resolves.toEqual([
      { table_name: 'member', table_type: 'BASE TABLE' },
    ]);
    await expect(service.tableInfo('member')).resolves.toEqual([
      { column_name: 'id' },
    ]);
    await expect(service.describeTable('member')).resolves.toEqual({
      table_name: 'member',
      table_schema: 'public',
      table_type: 'BASE TABLE',
      columns: [],
      constraints: [],
      indexes: [],
    });

    expect(engine.getTableNames).toHaveBeenCalledWith(db);
    expect(engine.getTableInfo).toHaveBeenCalledWith(db, 'member');
    expect(engine.describeTable).toHaveBeenCalledWith(db, 'member');
  });

  it('uses the engine parameter syntax for id-based lookups', async () => {
    vi.mocked(db.selectSingle).mockResolvedValue({
      id: 7,
      email: 'museum@example.com',
    });

    await expect(service.selectSingleById('member', 7)).resolves.toEqual({
      id: 7,
      email: 'museum@example.com',
    });
    await expect(
      service.getColumnFromRecordbyId('member', 7, 'email'),
    ).resolves.toBe('museum@example.com');

    expect(engine.parameter).toHaveBeenNthCalledWith(1, 1);
    expect(engine.parameter).toHaveBeenNthCalledWith(2, 1);
    expect(db.selectSingle).toHaveBeenNthCalledWith(
      1,
      'member',
      'WHERE id=$1',
      [7],
    );
    expect(db.selectSingle).toHaveBeenNthCalledWith(
      2,
      'member',
      'WHERE id=$1',
      [7],
    );
  });

  it('delegates create table SQL generation to the active engine', async () => {
    vi.mocked(engine.createTableSql).mockReturnValueOnce(
      'CREATE TABLE "member" ("id" integer PRIMARY KEY)',
    );

    await expect(
      service.createTable('member', [
        {
          name: 'name',
          type: 'text',
          nullable: false,
        },
      ]),
    ).resolves.toBe('CREATE TABLE "member" ("id" integer PRIMARY KEY)');

    expect(engine.createTableSql).toHaveBeenCalledWith('member', [
      {
        name: 'name',
        type: 'text',
        nullable: false,
      },
    ]);
  });

  it('uses the engine pagination syntax for index queries', async () => {
    vi.mocked(db.execute).mockResolvedValueOnce({
      rows: [{ id: 1 }],
    });

    await expect(service.index('member', 2, 5)).resolves.toEqual([{ id: 1 }]);

    expect(engine.paginateQuery).toHaveBeenCalledWith(
      'SELECT * FROM "member"',
      5,
      10,
      null,
    );
    expect(db.execute).toHaveBeenCalledWith(
      'SELECT * FROM "member"\nLIMIT 5 OFFSET 10',
      [],
    );
  });

  it('passes raw SQL execution through to the active database', async () => {
    const result: RecordSet = { rows: [{ id: 1 }] };
    vi.mocked(db.execute).mockResolvedValueOnce(result);

    await expect(service.execute('SELECT 1', [])).resolves.toBe(result);

    expect(db.execute).toHaveBeenCalledWith('SELECT 1', []);
  });
});
