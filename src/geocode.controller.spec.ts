import { GeocodeController } from './controllers/geocode.controller';

describe('GeocodeController', () => {
  let controller: GeocodeController;
  const dataAccessService = {
    geocodeByAddress: vi.fn(),
    geocodeByPostcode: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new GeocodeController(dataAccessService as any);
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
