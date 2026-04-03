import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { DataAccessService } from './data-access.service';
import {
  DatabaseAdapter,
  RecordSet,
  SupportsCreateTableSql,
  SupportsSchemaDescription,
  SupportsTableInfo,
  SupportsTableListing,
} from '../data/database';

function createAdapterMock(): DatabaseAdapter &
  SupportsTableListing &
  SupportsTableInfo &
  SupportsSchemaDescription &
  SupportsCreateTableSql {
  return {
    name: 'test',
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
    getTableNames: vi.fn(),
    getTableInfo: vi.fn(),
    describeTable: vi.fn(),
    createTableSql: vi.fn(),
  };
}

describe('DataAccessService', () => {
  let adapter: ReturnType<typeof createAdapterMock>;
  let service: DataAccessService;

  beforeEach(() => {
    adapter = createAdapterMock();
    vi.mocked(adapter.tableExists).mockResolvedValue(true);
    service = new DataAccessService(adapter);
  });

  it('delegates generic table metadata to the active adapter', async () => {
    vi.mocked(adapter.getTableNames).mockResolvedValueOnce([
      { table_name: 'member', table_type: 'BASE TABLE' },
    ]);
    vi.mocked(adapter.getTableInfo).mockResolvedValueOnce([
      { column_name: 'id' },
    ]);
    vi.mocked(adapter.describeTable).mockResolvedValueOnce({
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
  });

  it('uses the adapter parameter syntax for id-based lookups', async () => {
    vi.mocked(adapter.selectSingle).mockResolvedValue({
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

    expect(adapter.parameter).toHaveBeenNthCalledWith(1, 1);
    expect(adapter.parameter).toHaveBeenNthCalledWith(2, 1);
    expect(adapter.selectSingle).toHaveBeenNthCalledWith(
      1,
      'member',
      'WHERE id=$1',
      [7],
    );
    expect(adapter.selectSingle).toHaveBeenNthCalledWith(
      2,
      'member',
      'WHERE id=$1',
      [7],
    );
  });

  it('delegates create table SQL generation to the active adapter', async () => {
    vi.mocked(adapter.createTableSql).mockReturnValueOnce(
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

    expect(adapter.createTableSql).toHaveBeenCalledWith('member', [
      {
        name: 'name',
        type: 'text',
        nullable: false,
      },
    ]);
  });

  it('uses the adapter pagination syntax for index queries', async () => {
    vi.mocked(adapter.execute).mockResolvedValueOnce({
      rows: [{ id: 1 }],
    } as RecordSet);

    await expect(service.index('member', 2, 5)).resolves.toEqual([{ id: 1 }]);

    expect(adapter.paginateQuery).toHaveBeenCalledWith(
      'SELECT * FROM "member"',
      5,
      10,
      null,
    );
    expect(adapter.execute).toHaveBeenCalledWith(
      'SELECT * FROM "member"\nLIMIT 5 OFFSET 10',
      [],
    );
  });

  it('passes raw SQL execution through to the active adapter', async () => {
    const result: RecordSet = { rows: [{ id: 1 }] };
    vi.mocked(adapter.execute).mockResolvedValueOnce(result);

    await expect(service.execute('SELECT 1', [])).resolves.toBe(result);
    expect(adapter.execute).toHaveBeenCalledWith('SELECT 1', []);
  });

  it('rejects non-array SQL args with a bad request error', async () => {
    await expect(
      service.execute('SELECT 1', { id: 1 } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns not found errors for missing tables and records', async () => {
    vi.mocked(adapter.tableExists).mockResolvedValueOnce(false);

    await expect(service.index('missing_table', 0, 10)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    vi.mocked(adapter.tableExists).mockResolvedValueOnce(true);
    vi.mocked(adapter.selectSingle).mockResolvedValueOnce(undefined as any);

    await expect(service.selectSingleById('member', 7)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when an optional capability is not supported', async () => {
    const limitedAdapter: DatabaseAdapter = {
      name: 'limited',
      quoteIdentifier: (name: string) => `"${name}"`,
      parameter: (index: number) => `$${index}`,
      paginateQuery: (baseQuery: string) => baseQuery,
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      select: vi.fn(),
      selectSingle: vi.fn(),
      execute: vi.fn(),
      executeSingle: vi.fn(),
      executeScalar: vi.fn(),
      tableExists: vi.fn().mockResolvedValue(true),
      release: vi.fn(),
    };

    const limitedService = new DataAccessService(limitedAdapter);

    await expect(limitedService.describeTable('member')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });
});
