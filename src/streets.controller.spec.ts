import { Test, TestingModule } from '@nestjs/testing';
import { StreetsController } from './controllers/streets.controller';
import { DataAccessService } from './service/data-access.service';

describe('StreetsController', () => {
  let controller: StreetsController;
  const dataAccessService = {
    nearestStreets: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [StreetsController],
      providers: [
        {
          provide: DataAccessService,
          useValue: dataAccessService,
        },
      ],
    }).compile();

    controller = app.get<StreetsController>(StreetsController);
  });

  it('returns the nearest streets for a lat/long pair', async () => {
    dataAccessService.nearestStreets.mockResolvedValueOnce([
      { straatnaam: 'Damrak', distance_m: 12.34 },
    ]);

    const result = await controller.nearestStreets(52.370216, 4.895168);

    expect(dataAccessService.nearestStreets).toHaveBeenCalledWith(
      52.370216,
      4.895168,
    );
    expect(result).toEqual([{ straatnaam: 'Damrak', distance_m: 12.34 }]);
  });
});
