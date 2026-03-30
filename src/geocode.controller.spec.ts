import { Test, TestingModule } from '@nestjs/testing';
import { GeocodeController } from './controllers/geocode.controller';
import { DataAccessService } from './service/data-access.service';

describe('GeocodeController', () => {
  let controller: GeocodeController;
  const dataAccessService = {
    geocodeByAddress: vi.fn(),
    geocodeByPostcode: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [GeocodeController],
      providers: [
        {
          provide: DataAccessService,
          useValue: dataAccessService,
        },
      ],
    }).compile();

    controller = app.get<GeocodeController>(GeocodeController);
  });

  it('returns coordinates for a street, house number, and city', async () => {
    dataAccessService.geocodeByAddress.mockResolvedValueOnce([
      {
        straatnaam: 'Museumstraat',
        huisnummer: 1,
        huisletter: null,
        huisnummertoevoeging: null,
        postcode: '1071XX',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
      },
    ]);

    const result = await controller.geocodeAddress(
      'Museumstraat',
      1,
      'Amsterdam',
    );

    expect(dataAccessService.geocodeByAddress).toHaveBeenCalledWith(
      'Museumstraat',
      1,
      'Amsterdam',
    );
    expect(result).toEqual([
      {
        straatnaam: 'Museumstraat',
        huisnummer: 1,
        huisletter: null,
        huisnummertoevoeging: null,
        postcode: '1071XX',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
      },
    ]);
  });

  it('returns coordinates for a postcode and house number', async () => {
    dataAccessService.geocodeByPostcode.mockResolvedValueOnce([
      {
        straatnaam: 'Museumstraat',
        huisnummer: 1,
        huisletter: null,
        huisnummertoevoeging: null,
        postcode: '1071XX',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
      },
    ]);

    const result = await controller.geocodePostcode('1071XX', 1);

    expect(dataAccessService.geocodeByPostcode).toHaveBeenCalledWith(
      '1071XX',
      1,
    );
    expect(result).toEqual([
      {
        straatnaam: 'Museumstraat',
        huisnummer: 1,
        huisletter: null,
        huisnummertoevoeging: null,
        postcode: '1071XX',
        woonplaats: 'Amsterdam',
        latitude: 52.359942,
        longitude: 4.885386,
      },
    ]);
  });
});
