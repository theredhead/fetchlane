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
      {
        openbareruimte_id: '0363300000001911',
        straatnaam: 'Museumstraat',
        woonplaats_id: '1024',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
        distance_m: 12.34,
      },
    ]);

    const result = await controller.nearestStreets(52.370216, 4.895168);

    expect(dataAccessService.nearestStreets).toHaveBeenCalledWith(
      52.370216,
      4.895168,
    );
    expect(result).toEqual([
      {
        openbareruimte_id: '0363300000001911',
        straatnaam: 'Museumstraat',
        woonplaats_id: '1024',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
        distance_m: 12.34,
      },
    ]);
  });
});
