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

  it('delegates index requests to the data access service', async () => {
    dataAccessService.index.mockResolvedValueOnce([]);

    await controller.index('test', 2, 3);

    expect(dataAccessService.index).toHaveBeenCalledWith('test', 2, 3);
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
});
