import { PostgresDatabase } from './postgres-database';

let connectMock: any;
let endMock: any;

vi.mock('pg', () => ({
  Pool: vi.fn(() => ({
    connect: connectMock,
    end: endMock,
  })),
}));

describe('PostgresDatabase', () => {
  let database: PostgresDatabase;

  beforeEach(() => {
    endMock = vi.fn();
    connectMock = vi.fn();
    database = new PostgresDatabase({} as any);
  });

  it('executes select queries and releases the client', async () => {
    const release = vi.fn();
    connectMock.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'SELECT',
        rowCount: 1,
        rows: [{ id: 1 }],
        fields: [{ name: 'id' }],
      }),
      release,
    });

    const result = await database.execute('SELECT 1');

    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.fields).toEqual([{ name: 'id' }]);
    expect(release).toHaveBeenCalled();
  });

  it('maps command results into info', async () => {
    const release = vi.fn();
    connectMock.mockResolvedValue({
      query: vi.fn().mockResolvedValue({
        command: 'INSERT',
        rowCount: 1,
        rows: [{ id: 7 }],
        fields: [],
      }),
      release,
    });

    const result = await database.execute('INSERT ...');

    expect(result.info).toEqual({ affectedRows: 1, insertId: 7 });
    expect(result.rows).toEqual([{ id: 7 }]);
    expect(release).toHaveBeenCalled();
  });

  it('maps nearest streets with city information when available', async () => {
    vi.spyOn(database, 'tableExists').mockResolvedValue(true);
    const executeSpy = vi.spyOn(database, 'execute').mockResolvedValue({
      info: {},
      fields: [],
      rows: [
        {
          openbareruimte_id: '0363',
          straatnaam: 'Museumstraat',
          woonplaats_id: '1024',
          woonplaats: 'Amsterdam',
          latitude: '52.37',
          longitude: '4.89',
          distance_m: '12.34',
        },
      ],
    } as any);

    const result = await database.nearestStreets(52.37, 4.89);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN bag_woonplaats'),
      [4.89, 52.37],
    );
    expect(result).toEqual([
      {
        openbareruimte_id: '0363',
        straatnaam: 'Museumstraat',
        woonplaats_id: '1024',
        woonplaats: 'Amsterdam',
        latitude: 52.37,
        longitude: 4.89,
        distance_m: 12.34,
      },
    ]);
  });

  it('normalizes postcode geocoding without the woonplaats table', async () => {
    vi.spyOn(database, 'tableExists').mockResolvedValue(false);
    const executeSpy = vi.spyOn(database, 'execute').mockResolvedValue({
      info: {},
      fields: [],
      rows: [
        {
          straatnaam: 'Museumstraat',
          huisnummer: '1',
          huisletter: '',
          huisnummertoevoeging: null,
          postcode: '1071 XX',
          woonplaats: null,
          latitude: '52.359942',
          longitude: '4.885386',
        },
      ],
    } as any);

    const result = await database.geocodeByPostcode('1071 xx', 1);

    expect(executeSpy).toHaveBeenCalledWith(
      expect.not.stringContaining('LEFT JOIN bag_woonplaats'),
      ['1071XX', 1],
    );
    expect(result).toEqual([
      {
        straatnaam: 'Museumstraat',
        huisnummer: 1,
        huisletter: null,
        huisnummertoevoeging: null,
        postcode: '1071 XX',
        woonplaats: null,
        latitude: 52.359942,
        longitude: 4.885386,
      },
    ]);
  });

  it('ends the pool on release', () => {
    database.release();
    expect(endMock).toHaveBeenCalled();
  });
});
