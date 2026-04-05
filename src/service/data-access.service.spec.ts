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

  describe('update', () => {
    it('delegates update to the adapter and returns the updated record', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: false },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        id: 7,
        name: 'updated',
      });

      await expect(
        service.update('member', { id: 7 }, { name: 'updated' }),
      ).resolves.toEqual({ id: 7, name: 'updated' });

      expect(adapter.update).toHaveBeenCalledWith(
        'member',
        { id: 7 },
        { name: 'updated' },
      );
    });

    it('strips auto-generated primary key columns from the update payload', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        id: 7,
        name: 'updated',
      });

      await service.update('member', { id: 7 }, { id: 7, name: 'updated' });

      expect(adapter.update).toHaveBeenCalledWith(
        'member',
        { id: 7 },
        { name: 'updated' },
      );
    });

    it('returns not found when the record does not exist after update', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([]);
      vi.mocked(adapter.update).mockResolvedValueOnce(undefined as any);

      await expect(
        service.update('member', { id: 999 }, { name: 'ghost' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns not found when the table does not exist', async () => {
      vi.mocked(adapter.tableExists).mockResolvedValueOnce(false);

      await expect(
        service.update('missing', { id: 1 }, { name: 'test' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('delete', () => {
    it('delegates delete to the adapter and returns the deleted record', async () => {
      vi.mocked(adapter.delete).mockResolvedValueOnce({
        id: 7,
        name: 'Alice',
      });

      await expect(service.delete('member', { id: 7 })).resolves.toEqual({
        id: 7,
        name: 'Alice',
      });

      expect(adapter.delete).toHaveBeenCalledWith('member', { id: 7 });
    });

    it('returns not found when the record does not exist', async () => {
      vi.mocked(adapter.delete).mockResolvedValueOnce(undefined as any);

      await expect(
        service.delete('member', { id: 999 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns not found when the table does not exist', async () => {
      vi.mocked(adapter.tableExists).mockResolvedValueOnce(false);

      await expect(service.delete('missing', { id: 1 })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getColumnFromRecord', () => {
    it('returns a column value from a record', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce({
        id: 7,
        email: 'alice@example.com',
      });

      await expect(
        service.getColumnFromRecord('member', { id: 7 }, 'email'),
      ).resolves.toBe('alice@example.com');
    });

    it('returns null when the column value is null', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce({
        id: 7,
        email: null,
      });

      await expect(
        service.getColumnFromRecord('member', { id: 7 }, 'email'),
      ).resolves.toBeNull();
    });

    it('throws bad request when the column does not exist on the record', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce({
        id: 7,
        name: 'Alice',
      });

      await expect(
        service.getColumnFromRecord('member', { id: 7 }, 'nonexistent'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws not found when the record does not exist', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce(undefined as any);

      await expect(
        service.getColumnFromRecord('member', { id: 999 }, 'email'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateColumnForRecord', () => {
    it('updates a single column and returns the full record', async () => {
      vi.mocked(adapter.update).mockResolvedValueOnce({
        id: 7,
        email: 'new@example.com',
      });

      await expect(
        service.updateColumnForRecord(
          'member',
          { id: 7 },
          'email',
          'new@example.com',
        ),
      ).resolves.toEqual({ id: 7, email: 'new@example.com' });

      expect(adapter.update).toHaveBeenCalledWith(
        'member',
        { id: 7 },
        { email: 'new@example.com' },
      );
    });

    it('throws not found when the record does not exist', async () => {
      vi.mocked(adapter.update).mockResolvedValueOnce(undefined as any);

      await expect(
        service.updateColumnForRecord('member', { id: 999 }, 'email', 'x'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getPrimaryKeyColumns', () => {
    it('returns config override when available', async () => {
      const override = [{ column: 'id', dataType: 'uuid', isGenerated: false }];
      vi.mocked(runtimeConfig.getPrimaryKeyOverride).mockReturnValueOnce(
        override,
      );

      await expect(service.getPrimaryKeyColumns('member')).resolves.toEqual(
        override,
      );

      expect(adapter.getPrimaryKeyColumns).not.toHaveBeenCalled();
    });

    it('falls back to adapter when no config override exists', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);

      await expect(service.getPrimaryKeyColumns('member')).resolves.toEqual([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
    });
  });

  describe('composite primary key where clause', () => {
    it('builds multi-column where clauses for composite keys', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce({
        orderId: 1,
        productCode: 'ABC',
        quantity: 5,
      });

      await service.selectSingleByPrimaryKey('orderItem', {
        orderId: 1,
        productCode: 'ABC',
      });

      expect(adapter.selectSingle).toHaveBeenCalledWith(
        'orderItem',
        'WHERE "orderId"=$1 AND "productCode"=$2',
        [1, 'ABC'],
      );
    });
  });

  describe('primary key scenarios', () => {
    it('handles a non-id primary key name', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'employee_number', dataType: 'integer', isGenerated: true },
      ]);
      vi.mocked(adapter.insert).mockResolvedValueOnce({
        employee_number: 1001,
        name: 'Alice',
      });

      await expect(
        service.insert('employee', { name: 'Alice' }),
      ).resolves.toEqual({ employee_number: 1001, name: 'Alice' });

      expect(adapter.insert).toHaveBeenCalledWith('employee', {
        name: 'Alice',
      });
    });

    it('selects by a non-id primary key name', async () => {
      vi.mocked(adapter.selectSingle).mockResolvedValueOnce({
        employee_number: 1001,
        name: 'Alice',
      });

      await service.selectSingleByPrimaryKey('employee', {
        employee_number: 1001,
      });

      expect(adapter.selectSingle).toHaveBeenCalledWith(
        'employee',
        'WHERE "employee_number"=$1',
        [1001],
      );
    });

    it('inserts with a string primary key', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'slug', dataType: 'varchar', isGenerated: false },
      ]);
      vi.mocked(adapter.insert).mockResolvedValueOnce({
        slug: 'hello-world',
        title: 'Hello World',
      });

      await expect(
        service.insert('article', {
          slug: 'hello-world',
          title: 'Hello World',
        }),
      ).resolves.toEqual({ slug: 'hello-world', title: 'Hello World' });

      expect(adapter.insert).toHaveBeenCalledWith('article', {
        slug: 'hello-world',
        title: 'Hello World',
      });
    });

    it('inserts with a UUID primary key', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'uuid', isGenerated: false },
      ]);
      vi.mocked(adapter.insert).mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'alice@example.com',
      });

      await expect(
        service.insert('account', {
          id: '550e8400-e29b-41d4-a716-446655440000',
          email: 'alice@example.com',
        }),
      ).resolves.toEqual({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'alice@example.com',
      });
    });

    it('updates by composite primary key', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'tenantId', dataType: 'uuid', isGenerated: false },
        { column: 'userId', dataType: 'uuid', isGenerated: false },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        tenantId: 'a',
        userId: 'b',
        role: 'editor',
      });

      await expect(
        service.update(
          'tenantUser',
          { tenantId: 'a', userId: 'b' },
          { role: 'editor' },
        ),
      ).resolves.toEqual({ tenantId: 'a', userId: 'b', role: 'editor' });

      expect(adapter.update).toHaveBeenCalledWith(
        'tenantUser',
        { tenantId: 'a', userId: 'b' },
        { role: 'editor' },
      );
    });

    it('deletes by composite primary key', async () => {
      vi.mocked(adapter.delete).mockResolvedValueOnce({
        tenantId: 'a',
        userId: 'b',
        role: 'admin',
      });

      await expect(
        service.delete('tenantUser', { tenantId: 'a', userId: 'b' }),
      ).resolves.toEqual({ tenantId: 'a', userId: 'b', role: 'admin' });

      expect(adapter.delete).toHaveBeenCalledWith('tenantUser', {
        tenantId: 'a',
        userId: 'b',
      });
    });

    it('handles tables with no primary key for all operations', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValue([]);

      vi.mocked(adapter.insert).mockResolvedValueOnce({ message: 'logged' });
      await expect(
        service.insert('auditLog', { message: 'logged' }),
      ).resolves.toEqual({ message: 'logged' });

      vi.mocked(adapter.update).mockResolvedValueOnce({ message: 'updated' });
      await expect(
        service.update('auditLog', { rowId: 1 }, { message: 'updated' }),
      ).resolves.toEqual({ message: 'updated' });
    });

    it('uses config override when adapter PK discovery fails', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockRejectedValueOnce(
        new Error('metadata query failed'),
      );
      vi.mocked(runtimeConfig.getPrimaryKeyOverride).mockReturnValueOnce([
        { column: 'legacyId', dataType: 'varchar', isGenerated: false },
      ]);
      vi.mocked(adapter.insert).mockResolvedValueOnce({
        legacyId: 'X-100',
        label: 'legacy',
      });

      await expect(
        service.insert('legacyTable', { legacyId: 'X-100', label: 'legacy' }),
      ).resolves.toEqual({ legacyId: 'X-100', label: 'legacy' });

      expect(adapter.getPrimaryKeyColumns).not.toHaveBeenCalled();
    });

    it('uses config override so adapter is never queried', async () => {
      vi.mocked(runtimeConfig.getPrimaryKeyOverride).mockReturnValueOnce([
        { column: 'code', dataType: 'varchar', isGenerated: false },
      ]);

      vi.mocked(adapter.insert).mockResolvedValueOnce({
        code: 'ABC',
        name: 'test',
      });

      await service.insert('product', { code: 'ABC', name: 'test' });

      expect(adapter.getPrimaryKeyColumns).not.toHaveBeenCalled();
      expect(adapter.insert).toHaveBeenCalledWith('product', {
        code: 'ABC',
        name: 'test',
      });
    });
  });

  describe('identity/auto-generated column handling', () => {
    it('rejects insert when caller sends generated identity value', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);

      await expect(
        service.insert('member', { id: 99, name: 'test' }),
      ).rejects.toThrow(/auto-generated primary key/);
      expect(adapter.insert).not.toHaveBeenCalled();
    });

    it('rejects insert when caller sends generated serial value', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'employee_number', dataType: 'serial', isGenerated: true },
      ]);

      await expect(
        service.insert('employee', { employee_number: 42, name: 'Bob' }),
      ).rejects.toThrow(/auto-generated primary key/);
      expect(adapter.insert).not.toHaveBeenCalled();
    });

    it('rejects insert when caller sends generated bigserial value', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'bigserial', isGenerated: true },
      ]);

      await expect(
        service.insert('bigTable', { id: 1, data: 'test' }),
      ).rejects.toThrow(/auto-generated primary key/);
    });

    it('rejects insert listing multiple generated columns by name', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
        { column: 'revision', dataType: 'integer', isGenerated: true },
      ]);

      await expect(
        service.insert('versionedEntity', {
          id: 1,
          revision: 1,
          content: 'test',
        }),
      ).rejects.toThrow(/id, revision/);
    });

    it('strips generated identity column from update payload', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        id: 7,
        name: 'updated',
      });

      await service.update('member', { id: 7 }, { id: 7, name: 'updated' });

      expect(adapter.update).toHaveBeenCalledWith(
        'member',
        { id: 7 },
        { name: 'updated' },
      );
    });

    it('strips generated column even when PK is named differently', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'employee_number', dataType: 'serial', isGenerated: true },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        employee_number: 42,
        name: 'updated',
      });

      await service.update(
        'employee',
        { employee_number: 42 },
        { employee_number: 42, name: 'updated', department: 'engineering' },
      );

      expect(adapter.update).toHaveBeenCalledWith(
        'employee',
        { employee_number: 42 },
        { name: 'updated', department: 'engineering' },
      );
    });

    it('strips multiple generated columns from composite key update', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
        { column: 'revision', dataType: 'integer', isGenerated: true },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        id: 1,
        revision: 3,
        content: 'new',
      });

      await service.update(
        'versionedEntity',
        { id: 1, revision: 3 },
        { id: 1, revision: 3, content: 'new' },
      );

      expect(adapter.update).toHaveBeenCalledWith(
        'versionedEntity',
        { id: 1, revision: 3 },
        { content: 'new' },
      );
    });

    it('does not strip non-generated primary key columns from update', async () => {
      vi.mocked(adapter.getPrimaryKeyColumns).mockResolvedValueOnce([
        { column: 'slug', dataType: 'varchar', isGenerated: false },
      ]);
      vi.mocked(adapter.update).mockResolvedValueOnce({
        slug: 'new-slug',
        title: 'Updated',
      });

      await service.update(
        'article',
        { slug: 'old-slug' },
        { slug: 'new-slug', title: 'Updated' },
      );

      expect(adapter.update).toHaveBeenCalledWith(
        'article',
        { slug: 'old-slug' },
        { slug: 'new-slug', title: 'Updated' },
      );
    });
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
