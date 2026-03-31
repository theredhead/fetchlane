import { Database } from './database';

export interface NearestStreet {
  openbareruimte_id: string;
  straatnaam: string;
  woonplaats_id: string | null;
  woonplaats: string | null;
  latitude: number;
  longitude: number;
  distance_m: number;
}

export interface GeocodedAddress {
  straatnaam: string;
  huisnummer: number;
  huisletter: string | null;
  huisnummertoevoeging: string | null;
  postcode: string | null;
  woonplaats: string | null;
  latitude: number;
  longitude: number;
}

export interface LocationDatabase extends Database {
  nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]>;
  geocodeByAddress(
    street: string,
    houseNumber: number,
    city: string,
  ): Promise<GeocodedAddress[]>;
  geocodeByPostcode(
    postcode: string,
    houseNumber: number,
  ): Promise<GeocodedAddress[]>;
}

export function isLocationDatabase(
  database: Database,
): database is LocationDatabase {
  const candidate = database as Partial<LocationDatabase>;

  return (
    typeof candidate.nearestStreets === 'function' &&
    typeof candidate.geocodeByAddress === 'function' &&
    typeof candidate.geocodeByPostcode === 'function'
  );
}
