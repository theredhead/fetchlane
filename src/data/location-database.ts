import { Database } from './database';

/**
 * Normalized nearest-street payload returned by location-aware databases.
 */
export interface NearestStreet {
  openbareruimte_id: string;
  straatnaam: string;
  woonplaats_id: string | null;
  woonplaats: string | null;
  latitude: number;
  longitude: number;
  distance_m: number;
}

/**
 * Normalized geocoding payload returned by location-aware databases.
 */
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

/**
 * Optional extension interface for databases that support location queries.
 */
export interface LocationDatabase extends Database {
  /** Returns the nearest streets for a latitude/longitude pair. */
  nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]>;
  /** Geocodes a street name, house number, and city. */
  geocodeByAddress(
    street: string,
    houseNumber: number,
    city: string,
  ): Promise<GeocodedAddress[]>;
  /** Geocodes a postcode and house number. */
  geocodeByPostcode(
    postcode: string,
    houseNumber: number,
  ): Promise<GeocodedAddress[]>;
}

/**
 * Type guard that checks whether a database implements the location extension.
 */
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
