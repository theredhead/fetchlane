import { Test, TestingModule } from '@nestjs/testing';
import { DataAccessController } from './controllers/data-access.controller';
import { DataAccessService } from './service/data-access.service';
import { FetchRequestHandlerService } from './service/fetch-request-handler.service';

describe('DataAccessController', () => {
  let controller: DataAccessController;
  const dataAccessService = {
    index: vi.fn(),
    tableInfo: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [DataAccessController],
      providers: [
        {
          provide: DataAccessService,
          useValue: dataAccessService,
        },
        {
          provide: FetchRequestHandlerService,
          useValue: {
            handleRequest: vi.fn(),
          },
        },
      ],
    }).compile();

    controller = app.get<DataAccessController>(DataAccessController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('supports the legacy table route alias', async () => {
    dataAccessService.index.mockResolvedValueOnce([]);

    await controller.indexLegacy('test', 2, 3);

    expect(dataAccessService.index).toHaveBeenCalledWith('test', 2, 3);
  });

  it('supports the legacy table info route alias', async () => {
    dataAccessService.tableInfo.mockResolvedValueOnce([]);

    await controller.tableInfoLegacy('member');

    expect(dataAccessService.tableInfo).toHaveBeenCalledWith('member');
  });
});
