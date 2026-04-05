import {
  BadRequestException,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { DataAccessService } from './data-access.service';
import {
  DatabaseAdapter,
  RecordSet,
  SupportsSchemaDescription,
  SupportsTableInfo,
  SupportsTableListing,
} from '../data/database';
import { RuntimeConfigService } from '../config/runtime-config';

function createAdapterMock(): DatabaseAdapter &
  SupportsTableListing &
  SupportsTableInfo &
  SupportsSchemaDescription {
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
    getPrimaryKeyColumns: vi.fn(),
  };
}

function createRuntimeConfigMock(): RuntimeConfigService {
  return {
    getPrimaryKeyOverride: vi.fn().mockReturnValue(undefined),
    getLimits: vi.fn().mockReturnValue({ fetchMaxPageSize: 1000 }),
  } as unknown as RuntimeConfigService;
}

describe('DataAccessService', () => {
  let adapter: ReturnType<typeof createAdapterMock>;
  let runtimeConfig: RuntimeConfigService;
  let service: DataAccessService;

  beforeEach(() => {
    adapter = createAdapterMock();
    runtimeConfig = createRuntimeConfigMock();
    vi.mocked(adapter.tableExists).mockResolvedValue(true);
    service = new DataAccessService(adapter, runtimeConfig);
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

  it('uses the adapter parameter syntax for primary-key-based lookups', async () => {
    vi.mocked(adapter.selectSingle).mockResolvedValue({
      id: 7,
      email: 'museum@example.com',
    });

    await expect(
      service.selectSingleByPrimaryKey('member', { id: 7 }),
    ).resolves.toEqual({
      id: 7,
      email: 'museum@example.com',
    });
    await expect(
      service.getColumnFromRecord('member', { id: 7 }, 'email'),
    ).resolves.toBe('museum@example.com');

    expect(adapter.parameter).toHaveBeenNthCalledWith(1, 1);
    expect(adapter.parameter).toHaveBeenNthCalledWith(2, 1);
    expect(adapter.selectSingle).toHaveBeenNthCalledWith(
      1,
      'member',
      'WHERE "id"=$1',
      [7],
    );
    expect(adapter.selectSingle).toHaveBeenNthCalledWith(
      2,
      'member',
      'WHERE "id"=$1',
      [7],
    );
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

  it('rejects inserts that include auto-generated primary key columns', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'id', dataType: 'integer', isGenerated: true },
    ]);

    await expect(
      service.insert('member', { id: 99, name: 'test' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(adapter.insert).not.toHaveBeenCalled();
  });

  it('allows inserts when the record omits auto-generated primary key columns', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'id', dataType: 'integer', isGenerated: true },
    ]);
    vi.mocked(adapter.insert).mockResolvedValueOnce({
      id: 1,
      name: 'test',
    });

    await expect(service.insert('member', { name: 'test' })).resolves.toEqual({
      id: 1,
      name: 'test',
    });

    expect(adapter.insert).toHaveBeenCalledWith('member', { name: 'test' });
  });

  it('allows inserts when primary key columns are not auto-generated', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'id', dataType: 'uuid', isGenerated: false },
    ]);
    vi.mocked(adapter.insert).mockResolvedValueOnce({
      id: 'abc-123',
      name: 'test',
    });

    await expect(
      service.insert('member', { id: 'abc-123', name: 'test' }),
    ).resolves.toEqual({ id: 'abc-123', name: 'test' });
  });

  it('rejects composite inserts when only the generated column is supplied', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'orderId', dataType: 'integer', isGenerated: true },
      { column: 'productCode', dataType: 'varchar', isGenerated: false },
    ]);

    await expect(
      service.insert('orderItem', {
        orderId: 42,
        productCode: 'ABC',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(adapter.insert).not.toHaveBeenCalled();
  });

  it('allows composite inserts when generated columns are omitted', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'orderId', dataType: 'integer', isGenerated: true },
      { column: 'productCode', dataType: 'varchar', isGenerated: false },
    ]);
    vi.mocked(adapter.insert).mockResolvedValueOnce({
      orderId: 1,
      productCode: 'ABC',
      quantity: 1,
    });

    await expect(
      service.insert('orderItem', { productCode: 'ABC', quantity: 1 }),
    ).resolves.toEqual({ orderId: 1, productCode: 'ABC', quantity: 1 });

    expect(adapter.insert).toHaveBeenCalledWith('orderItem', {
      productCode: 'ABC',
      quantity: 1,
    });
  });

  it('allows composite inserts when no columns are auto-generated', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'tenantId', dataType: 'uuid', isGenerated: false },
      { column: 'userId', dataType: 'uuid', isGenerated: false },
    ]);
    vi.mocked(adapter.insert).mockResolvedValueOnce({
      tenantId: 'a',
      userId: 'b',
      role: 'admin',
    });

    await expect(
      service.insert('tenantUser', {
        tenantId: 'a',
        userId: 'b',
        role: 'admin',
      }),
    ).resolves.toEqual({ tenantId: 'a', userId: 'b', role: 'admin' });
  });

  it('rejects composite inserts naming multiple generated columns', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
      { column: 'id', dataType: 'integer', isGenerated: true },
      { column: 'revision', dataType: 'integer', isGenerated: true },
    ]);

    await expect(
      service.insert('auditLog', { id: 1, revision: 7, message: 'hello' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(adapter.insert).not.toHaveBeenCalled();
  });

  it('allows inserts when the table has no primary key columns', async () => {
    vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([]);
    vi.mocked(adapter.insert).mockResolvedValueOnce({ name: 'test' });

    await expect(
      service.insert('logEntries', { name: 'test' }),
    ).resolves.toEqual({ name: 'test' });

    expect(adapter.insert).toHaveBeenCalledWith('logEntries', { name: 'test' });
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

    await expect(
      service.selectSingleByPrimaryKey('member', { id: 7 }),
    ).rejects.toBeInstanceOf(NotFoundException);
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
      getPrimaryKeyColumns: vi.fn(),
    };

    const limitedService = new DataAccessService(limitedAdapter, runtimeConfig);

    await expect(limitedService.describeTable('member')).rejects.toBeInstanceOf(
      NotImplementedException,
    );
  });
});
