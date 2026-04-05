import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DataAccessController } from './data-access.controller';
import { DataAccessService } from '../service/data-access.service';
import { FetchRequestHandlerService } from '../service/fetch-request-handler.service';
import { AuthorizationService } from '../authentication/authorization.service';
import { RuntimeConfigService } from '../config/runtime-config';

function createMockRequest(url = '/api/data-access/member'): any {
  return {
    method: 'GET',
    url,
    fetchlaneContext: { requestId: 'test-request-id', principal: null },
  };
}

function createMocks() {
  const db = {
    getTableNames: vi.fn(),
    tableInfo: vi.fn(),
    describeTable: vi.fn(),
    index: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    selectSingleByPrimaryKey: vi.fn(),
    getColumnFromRecord: vi.fn(),
    updateColumnForRecord: vi.fn(),
    execute: vi.fn(),
    getPrimaryKeyColumns: vi.fn(),
  };

  const fetchRequestHandler = {
    handleRequest: vi.fn(),
  };

  const authz = {
    authorizeCrud: vi.fn(),
    authorizeSchemaAccess: vi.fn(),
  };

  const runtimeConfig = {
    isSchemaFeaturesEnabled: vi.fn().mockReturnValue(true),
    getLimits: vi.fn().mockReturnValue({ fetchMaxPageSize: 1000 }),
  };

  const controller = new DataAccessController(
    db as unknown as DataAccessService,
    fetchRequestHandler as unknown as FetchRequestHandlerService,
    authz as unknown as AuthorizationService,
    runtimeConfig as unknown as RuntimeConfigService,
  );

  return { controller, db, fetchRequestHandler, authz, runtimeConfig };
}

describe('DataAccessController', () => {
  let controller: DataAccessController;
  let db: ReturnType<typeof createMocks>['db'];
  let fetchRequestHandler: ReturnType<
    typeof createMocks
  >['fetchRequestHandler'];
  let authz: ReturnType<typeof createMocks>['authz'];
  let runtimeConfig: ReturnType<typeof createMocks>['runtimeConfig'];

  beforeEach(() => {
    vi.clearAllMocks();
    const mocks = createMocks();
    controller = mocks.controller;
    db = mocks.db;
    fetchRequestHandler = mocks.fetchRequestHandler;
    authz = mocks.authz;
    runtimeConfig = mocks.runtimeConfig;
  });

  describe('fetch', () => {
    it('delegates to fetchRequestHandler and returns the result', async () => {
      const result = { rows: [{ id: 1 }] };
      fetchRequestHandler.handleRequest.mockResolvedValueOnce(result);

      const request = {
        table: 'member',
        predicates: [],
        sort: [],
      };

      await expect(
        controller.fetch(createMockRequest(), request),
      ).resolves.toBe(result);
      expect(authz.authorizeCrud).toHaveBeenCalledWith(
        expect.anything(),
        'member',
        'read',
      );
    });

    it('rejects non-object request bodies', async () => {
      await expect(
        controller.fetch(createMockRequest(), null as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects array request bodies', async () => {
      await expect(
        controller.fetch(createMockRequest(), [] as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('tableNames', () => {
    it('delegates table listing to the service', async () => {
      db.getTableNames.mockResolvedValueOnce([{ table_name: 'member' }]);

      await expect(controller.tableNames(createMockRequest())).resolves.toEqual(
        [{ table_name: 'member' }],
      );
      expect(authz.authorizeSchemaAccess).toHaveBeenCalled();
    });

    it('throws not found when schema features are disabled', async () => {
      runtimeConfig.isSchemaFeaturesEnabled.mockReturnValueOnce(false);

      await expect(
        controller.tableNames(createMockRequest()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('tableInfo', () => {
    it('validates the table name', async () => {
      await expect(
        controller.tableInfo(createMockRequest(), ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects table names with invalid characters', async () => {
      await expect(
        controller.tableInfo(createMockRequest(), 'table; DROP TABLE'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('describeTable', () => {
    it('returns schema description for a valid table', async () => {
      const schema = {
        table_name: 'member',
        table_schema: 'public',
        table_type: 'BASE TABLE',
        columns: [],
        constraints: [],
        indexes: [],
      };
      db.describeTable.mockResolvedValueOnce(schema);

      await expect(
        controller.describeTable(createMockRequest(), 'member'),
      ).resolves.toEqual(schema);
    });
  });

  describe('index', () => {
    it('returns paginated rows with default parameters', async () => {
      db.index.mockResolvedValueOnce([{ id: 1 }]);

      await expect(
        controller.index(createMockRequest(), 'member'),
      ).resolves.toEqual([{ id: 1 }]);
      expect(db.index).toHaveBeenCalledWith('member', 0, 100);
    });

    it('parses pageIndex and pageSize from query strings', async () => {
      db.index.mockResolvedValueOnce([{ id: 2 }]);

      await expect(
        controller.index(createMockRequest(), 'member', '2', '25'),
      ).resolves.toEqual([{ id: 2 }]);
      expect(db.index).toHaveBeenCalledWith('member', 2, 25);
    });

    it('rejects negative pageIndex', async () => {
      await expect(
        controller.index(createMockRequest(), 'member', '-1', '10'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects pageSize of 0', async () => {
      await expect(
        controller.index(createMockRequest(), 'member', '0', '0'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects pageSize exceeding the max', async () => {
      await expect(
        controller.index(createMockRequest(), 'member', '0', '1001'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-integer pageIndex', async () => {
      await expect(
        controller.index(createMockRequest(), 'member', '1.5', '10'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects array values for query parameters', async () => {
      await expect(
        controller.index(
          createMockRequest(),
          'member',
          ['0', '1'] as any,
          '10',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createRecord', () => {
    it('delegates creation to the service', async () => {
      db.insert.mockResolvedValueOnce({ id: 1, name: 'Alice' });

      await expect(
        controller.createRecord(createMockRequest(), 'member', {
          name: 'Alice',
        }),
      ).resolves.toEqual({ id: 1, name: 'Alice' });
      expect(authz.authorizeCrud).toHaveBeenCalledWith(
        expect.anything(),
        'member',
        'create',
      );
    });

    it('rejects empty record bodies', async () => {
      await expect(
        controller.createRecord(createMockRequest(), 'member', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects non-object record bodies', async () => {
      await expect(
        controller.createRecord(createMockRequest(), 'member', null as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects array record bodies', async () => {
      await expect(
        controller.createRecord(createMockRequest(), 'member', [] as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getRecord', () => {
    it('resolves a single primary key and delegates to the service', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        id: 42,
        name: 'Alice',
      });

      await expect(
        controller.getRecord(createMockRequest(), 'member', '42'),
      ).resolves.toEqual({ id: 42, name: 'Alice' });
    });

    it('resolves composite primary keys from comma-separated path', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'orderId', dataType: 'integer', isGenerated: false },
        { column: 'productCode', dataType: 'varchar', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        orderId: 1,
        productCode: 'ABC',
      });

      await expect(
        controller.getRecord(createMockRequest(), 'orderItem', '1,ABC'),
      ).resolves.toEqual({ orderId: 1, productCode: 'ABC' });
    });

    it('throws when primary key segment count mismatches column count', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'orderId', dataType: 'integer', isGenerated: false },
        { column: 'productCode', dataType: 'varchar', isGenerated: false },
      ]);

      await expect(
        controller.getRecord(createMockRequest(), 'orderItem', '1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws when no PK metadata is available', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([]);

      await expect(
        controller.getRecord(createMockRequest(), 'member', '42'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('coerces integer primary key values', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'bigint', isGenerated: true },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({ id: 42 });

      await controller.getRecord(createMockRequest(), 'member', '42');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('member', {
        id: 42,
      });
    });

    it('rejects non-numeric values for integer primary key columns', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);

      await expect(
        controller.getRecord(createMockRequest(), 'member', 'abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('passes string values through for non-integer primary key columns', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'uuid', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        id: 'abc-123',
      });

      await controller.getRecord(createMockRequest(), 'member', 'abc-123');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('member', {
        id: 'abc-123',
      });
    });

    it('throws bad request for empty primary key path', async () => {
      await expect(
        controller.getRecord(createMockRequest(), 'member', ''),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resolves a non-id primary key name', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'employee_number', dataType: 'integer', isGenerated: true },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        employee_number: 1001,
        name: 'Alice',
      });

      await controller.getRecord(createMockRequest(), 'employee', '1001');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('employee', {
        employee_number: 1001,
      });
    });

    it('resolves a string primary key without coercion', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'slug', dataType: 'varchar', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        slug: 'hello-world',
        title: 'Hello',
      });

      await controller.getRecord(createMockRequest(), 'article', 'hello-world');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('article', {
        slug: 'hello-world',
      });
    });

    it('resolves a UUID primary key without coercion', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'uuid', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      await controller.getRecord(
        createMockRequest(),
        'account',
        '550e8400-e29b-41d4-a716-446655440000',
      );

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('account', {
        id: '550e8400-e29b-41d4-a716-446655440000',
      });
    });

    it('coerces serial type to integer', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'serial', isGenerated: true },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({ id: 5 });

      await controller.getRecord(createMockRequest(), 'member', '5');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('member', {
        id: 5,
      });
    });

    it('coerces bigserial type to integer', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'bigserial', isGenerated: true },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({ id: 999 });

      await controller.getRecord(createMockRequest(), 'member', '999');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('member', {
        id: 999,
      });
    });

    it('coerces smallint type to integer', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'rank', dataType: 'smallint', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({ rank: 3 });

      await controller.getRecord(createMockRequest(), 'leaderboard', '3');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('leaderboard', {
        rank: 3,
      });
    });

    it('coerces tinyint type to integer', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'level', dataType: 'tinyint', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({ level: 1 });

      await controller.getRecord(createMockRequest(), 'permission', '1');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('permission', {
        level: 1,
      });
    });

    it('resolves composite key with mixed types', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'tenantId', dataType: 'uuid', isGenerated: false },
        { column: 'seqNum', dataType: 'integer', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        tenantId: 'abc-def',
        seqNum: 42,
      });

      await controller.getRecord(createMockRequest(), 'event', 'abc-def,42');

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('event', {
        tenantId: 'abc-def',
        seqNum: 42,
      });
    });

    it('decodes percent-encoded composite key segments', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'category', dataType: 'varchar', isGenerated: false },
        { column: 'name', dataType: 'varchar', isGenerated: false },
      ]);
      db.selectSingleByPrimaryKey.mockResolvedValueOnce({
        category: 'food & drink',
        name: 'coffee,tea',
      });

      await controller.getRecord(
        createMockRequest(),
        'product',
        'food%20%26%20drink,coffee%2Ctea',
      );

      expect(db.selectSingleByPrimaryKey).toHaveBeenCalledWith('product', {
        category: 'food & drink',
        name: 'coffee,tea',
      });
    });

    it('deletes by non-id primary key name', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'slug', dataType: 'varchar', isGenerated: false },
      ]);
      db.delete.mockResolvedValueOnce({ slug: 'old-post', title: 'Gone' });

      await controller.deleteRecord(createMockRequest(), 'article', 'old-post');

      expect(db.delete).toHaveBeenCalledWith('article', { slug: 'old-post' });
    });

    it('updates by UUID primary key', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'uuid', isGenerated: false },
      ]);
      db.update.mockResolvedValueOnce({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated',
      });

      await controller.updateRecord(
        createMockRequest(),
        'account',
        '550e8400-e29b-41d4-a716-446655440000',
        { name: 'Updated' },
      );

      expect(db.update).toHaveBeenCalledWith(
        'account',
        { id: '550e8400-e29b-41d4-a716-446655440000' },
        { name: 'Updated' },
      );
    });
  });

  describe('getColumnFromRecord', () => {
    it('returns a column value from a record', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      db.getColumnFromRecord.mockResolvedValueOnce('alice@example.com');

      await expect(
        controller.getColumnFromRecord(
          createMockRequest(),
          'member',
          '7',
          'email',
        ),
      ).resolves.toBe('alice@example.com');
    });
  });

  describe('updateColumnForRecord', () => {
    it('updates a column and returns the full record', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      db.updateColumnForRecord.mockResolvedValueOnce({
        id: 7,
        email: 'new@example.com',
      });

      await expect(
        controller.updateColumnForRecord(
          createMockRequest(),
          'member',
          '7',
          'email',
          'new@example.com',
        ),
      ).resolves.toEqual({ id: 7, email: 'new@example.com' });
      expect(authz.authorizeCrud).toHaveBeenCalledWith(
        expect.anything(),
        'member',
        'update',
      );
    });
  });

  describe('updateRecord', () => {
    it('resolves PK and delegates update to the service', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      db.update.mockResolvedValueOnce({ id: 7, name: 'Updated' });

      await expect(
        controller.updateRecord(createMockRequest(), 'member', '7', {
          name: 'Updated',
        }),
      ).resolves.toEqual({ id: 7, name: 'Updated' });
      expect(authz.authorizeCrud).toHaveBeenCalledWith(
        expect.anything(),
        'member',
        'update',
      );
    });

    it('rejects empty update bodies', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);

      await expect(
        controller.updateRecord(createMockRequest(), 'member', '7', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('deleteRecord', () => {
    it('resolves PK and delegates deletion to the service', async () => {
      db.getPrimaryKeyColumns.mockResolvedValueOnce([
        { column: 'id', dataType: 'integer', isGenerated: true },
      ]);
      db.delete.mockResolvedValueOnce({ id: 7, name: 'Alice' });

      await expect(
        controller.deleteRecord(createMockRequest(), 'member', '7'),
      ).resolves.toEqual({ id: 7, name: 'Alice' });
      expect(authz.authorizeCrud).toHaveBeenCalledWith(
        expect.anything(),
        'member',
        'delete',
      );
    });
  });

  describe('identifier validation', () => {
    it('rejects identifiers with SQL injection characters', async () => {
      await expect(
        controller.tableInfo(createMockRequest(), "member'; DROP TABLE"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts identifiers with dots and dollar signs', async () => {
      db.tableInfo.mockResolvedValueOnce([]);

      await expect(
        controller.tableInfo(createMockRequest(), 'public.member'),
      ).resolves.toEqual([]);
    });

    it('accepts identifiers starting with underscore', async () => {
      db.tableInfo.mockResolvedValueOnce([]);

      await expect(
        controller.tableInfo(createMockRequest(), '_internal'),
      ).resolves.toEqual([]);
    });
  });
});
