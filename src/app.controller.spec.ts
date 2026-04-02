import { BadRequestException } from '@nestjs/common';
import { DataAccessController } from './controllers/data-access.controller';

describe('DataAccessController', () => {
  let controller: DataAccessController;
  const dataAccessService = {
    getTableNames: vi.fn(),
    index: vi.fn(),
    tableInfo: vi.fn(),
    describeTable: vi.fn(),
    insert: vi.fn(),
    selectSingleById: vi.fn(),
    getColumnFromRecordbyId: vi.fn(),
    updateColumnForRecordById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    createTable: vi.fn(),
  };
  const fetchRequestHandler = {
    handleRequest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new DataAccessController(
      dataAccessService as any,
      fetchRequestHandler as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('delegates index requests to the data access service with parsed pagination', async () => {
    dataAccessService.index.mockResolvedValueOnce([]);

    await controller.index('test', '2', '3');

    expect(dataAccessService.index).toHaveBeenCalledWith('test', 2, 3);
  });

  it('rejects invalid pagination values', async () => {
    await expect(controller.index('test', '-1', '3')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.index('test', '0', '0')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.index('test', '0', '5000')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('delegates table info requests to the data access service', async () => {
    dataAccessService.tableInfo.mockResolvedValueOnce([]);

    await controller.tableInfo('member');

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

    await controller.fetch(request as any);

    expect(fetchRequestHandler.handleRequest).toHaveBeenCalledWith(request);
  });

  it('does not swallow fetch request errors', async () => {
    fetchRequestHandler.handleRequest.mockRejectedValueOnce(new Error('boom'));

    await expect(
      controller.fetch({
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

    await expect(controller.tableNames()).resolves.toEqual([
      { table_name: 'member' },
    ]);
    expect(dataAccessService.getTableNames).toHaveBeenCalled();
  });

  it('delegates describe table requests to the data access service', async () => {
    dataAccessService.describeTable.mockResolvedValueOnce({ table_name: 'member' });

    await controller.describeTable('member');

    expect(dataAccessService.describeTable).toHaveBeenCalledWith('member');
  });

  it('delegates record creation to the data access service', async () => {
    const record = { name: 'Alice' };
    dataAccessService.insert.mockResolvedValueOnce({ id: 1, ...record });

    await controller.createRecord('member', record as any);

    expect(dataAccessService.insert).toHaveBeenCalledWith('member', record);
  });

  it('rejects invalid identifiers and malformed record bodies', async () => {
    await expect(controller.tableInfo('member;drop')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.createRecord('member', [] as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(controller.updateRecord('member', 7, null as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('delegates id-based record lookup to the data access service', async () => {
    dataAccessService.selectSingleById.mockResolvedValueOnce({ id: 7 });

    await controller.getRecordbyId('member', 7);

    expect(dataAccessService.selectSingleById).toHaveBeenCalledWith(
      'member',
      7,
    );
  });

  it('delegates single-column lookup to the data access service', async () => {
    dataAccessService.getColumnFromRecordbyId.mockResolvedValueOnce(
      'alice@example.com',
    );

    await controller.getColumnFromRecordbyId('member', 7, 'email');

    expect(dataAccessService.getColumnFromRecordbyId).toHaveBeenCalledWith(
      'member',
      7,
      'email',
    );
  });

  it('delegates column updates, record updates, deletes, and create table requests', async () => {
    await controller.updateColumnForRecordById('member', 7, 'email', {
      value: 'alice@example.com',
    });
    await controller.updateRecord('member', 7, { name: 'Alice' } as any);
    await controller.deleteRecord('member', 7);
    await controller.createTable('member', [
      { name: 'name', type: 'text', nullable: false },
    ]);

    expect(dataAccessService.updateColumnForRecordById).toHaveBeenCalledWith(
      'member',
      7,
      'email',
      { value: 'alice@example.com' },
    );
    expect(dataAccessService.update).toHaveBeenCalledWith('member', 7, {
      name: 'Alice',
    });
    expect(dataAccessService.delete).toHaveBeenCalledWith('member', 7);
    expect(dataAccessService.createTable).toHaveBeenCalledWith('member', [
      { name: 'name', type: 'text', nullable: false },
    ]);
  });

  it('rejects malformed create table input', async () => {
    await expect(controller.createTable('member', [] as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      controller.createTable('member', [
        { name: 'name', type: '', nullable: false },
      ] as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
