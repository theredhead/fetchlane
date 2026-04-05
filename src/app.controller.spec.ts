import { BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { DataAccessController } from './controllers/data-access.controller';

describe('DataAccessController', () => {
  let controller: DataAccessController;
  const dataAccessService = {
    getTableNames: vi.fn(),
    index: vi.fn(),
    tableInfo: vi.fn(),
    describeTable: vi.fn(),
    insert: vi.fn(),
    selectSingleByPrimaryKey: vi.fn(),
    getColumnFromRecord: vi.fn(),
    updateColumnForRecord: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getPrimaryKeyColumns: vi.fn(),
  };
  const fetchRequestHandler = {
    handleRequest: vi.fn(),
  };
  const authorizationService = {
    authorizeSchemaAccess: vi.fn(),
    authorizeCrud: vi.fn(),
  };
  const runtimeConfigService = {
    isSchemaFeaturesEnabled: vi.fn().mockReturnValue(true),
    getLimits: vi.fn().mockReturnValue({ fetchMaxPageSize: 1000 }),
  };
  const mockRequest = {} as Request;

  beforeEach(() => {
    vi.clearAllMocks();
    dataAccessService.getPrimaryKeyColumns.mockResolvedValue([
      { column: 'id', dataType: 'integer' },
    ]);
    controller = new DataAccessController(
      dataAccessService as any,
      fetchRequestHandler as any,
      authorizationService as any,
      runtimeConfigService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates index requests to the data access service with parsed pagination', async () => {
    dataAccessService.index.mockResolvedValueOnce([]);

    await controller.index(mockRequest, 'test', '2', '3');

    expect(dataAccessService.index).toHaveBeenCalledWith('test', 2, 3);
  });

  it('rejects invalid pagination values', async () => {
    await expect(
      controller.index(mockRequest, 'test', '-1', '3'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.index(mockRequest, 'test', '0', '0'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.index(mockRequest, 'test', '0', '5000'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates table info requests to the data access service', async () => {
    dataAccessService.tableInfo.mockResolvedValueOnce([]);

    await controller.tableInfo(mockRequest, 'member');

    expect(dataAccessService.tableInfo).toHaveBeenCalledWith('member');
  });

  it('delegates fetch requests to the fetch request handler', async () => {
    const request = {
      table: 'member',
      predicates: [],
      sort: [],
      pagination: { index: 0, size: 10 },
    };
    fetchRequestHandler.handleRequest.mockResolvedValueOnce({ rows: [] });

    await controller.fetch(mockRequest, request as any);

    expect(fetchRequestHandler.handleRequest).toHaveBeenCalledWith(request);
  });

  it('does not swallow fetch request errors', async () => {
    fetchRequestHandler.handleRequest.mockRejectedValueOnce(new Error('boom'));

    await expect(
      controller.fetch(mockRequest, {
        table: 'member',
        predicates: [],
        sort: [],
      } as any),
    ).rejects.toThrow('boom');
  });

  it('returns table names from the data access service', async () => {
    dataAccessService.getTableNames.mockResolvedValueOnce([
      { table_name: 'member' },
    ]);

    await expect(controller.tableNames(mockRequest)).resolves.toEqual([
      { table_name: 'member' },
    ]);
    expect(dataAccessService.getTableNames).toHaveBeenCalled();
  });

  it('delegates describe table requests to the data access service', async () => {
    dataAccessService.describeTable.mockResolvedValueOnce({
      table_name: 'member',
    });

    await controller.describeTable(mockRequest, 'member');

    expect(dataAccessService.describeTable).toHaveBeenCalledWith('member');
  });

  it('delegates record creation to the data access service', async () => {
    const record = { name: 'Alice' };
    dataAccessService.insert.mockResolvedValueOnce({ id: 1, ...record });

    await controller.createRecord(mockRequest, 'member', record as any);

    expect(dataAccessService.insert).toHaveBeenCalledWith('member', record);
  });

  it('rejects invalid identifiers and malformed record bodies', async () => {
    await expect(
      controller.tableInfo(mockRequest, 'member;drop'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.createRecord(mockRequest, 'member', [] as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.updateRecord(mockRequest, 'member', '7', null as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('delegates primary-key-based record lookup to the data access service', async () => {
    dataAccessService.selectSingleByPrimaryKey.mockResolvedValueOnce({
      id: 7,
    });

    await controller.getRecord(mockRequest, 'member', '7');

    expect(dataAccessService.selectSingleByPrimaryKey).toHaveBeenCalledWith(
      'member',
      { id: 7 },
    );
  });

  it('delegates single-column lookup to the data access service', async () => {
    dataAccessService.getColumnFromRecord.mockResolvedValueOnce(
      'alice@example.com',
    );

    await controller.getColumnFromRecord(mockRequest, 'member', '7', 'email');

    expect(dataAccessService.getColumnFromRecord).toHaveBeenCalledWith(
      'member',
      { id: 7 },
      'email',
    );
  });

  it('delegates column updates, record updates, and deletes', async () => {
    await controller.updateColumnForRecord(
      mockRequest,
      'member',
      '7',
      'email',
      {
        value: 'alice@example.com',
      },
    );
    await controller.updateRecord(mockRequest, 'member', '7', {
      name: 'Alice',
    } as any);
    await controller.deleteRecord(mockRequest, 'member', '7');

    expect(dataAccessService.updateColumnForRecord).toHaveBeenCalledWith(
      'member',
      { id: 7 },
      'email',
      { value: 'alice@example.com' },
    );
    expect(dataAccessService.update).toHaveBeenCalledWith(
      'member',
      { id: 7 },
      { name: 'Alice' },
    );
    expect(dataAccessService.delete).toHaveBeenCalledWith('member', { id: 7 });
  });
});
