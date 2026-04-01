import { Inject, Injectable } from '@nestjs/common';
import { Database, Record } from 'src/data/database';
import { DatabaseEngine } from '../data/database-engine';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../data/database-metadata';
import {
  GeocodedAddress,
  isLocationDatabase,
  LocationDatabase,
  NearestStreet,
} from '../data/location-database';
import {
  ACTIVE_DATABASE_ENGINE,
  DATABASE_CONNECTION,
} from '../data/database.providers';

@Injectable()
/**
 * High-level facade over the active database connection and engine behavior.
 */
export class DataAccessService {
  /**
   * Creates the high-level data-access facade for the active database engine.
   */
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(ACTIVE_DATABASE_ENGINE)
    private readonly engine: DatabaseEngine,
  ) {}

  /** Lists the tables exposed by the active engine. */
  public async getTableNames(): Promise<any[]> {
    return await this.engine.getTableNames(this.db);
  }

  /** Returns basic column metadata for a table. */
  public async tableInfo(table: string): Promise<any> {
    return await this.engine.getTableInfo(this.db, table);
  }

  /** Returns normalized schema metadata for a table. */
  public async describeTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    return await this.engine.describeTable(this.db, table);
  }

  /** Returns a paginated list of rows from a table. */
  public async index(
    table: string,
    pageIndex = 0,
    pageSize = 1000,
  ): Promise<Record[]> {
    const parsedPageIndex = Number(pageIndex);
    const parsedPageSize = Number(pageSize);
    const offset = parsedPageIndex * parsedPageSize;
    const baseQuery = `SELECT * FROM ${this.engine.quoteIdentifier(table)}`;
    const data = await this.db.execute(
      this.engine.paginateQuery(baseQuery, parsedPageSize, offset, null),
      [],
    );
    return data.rows;
  }

  /** Looks up a single row by numeric `id`. */
  public async selectSingleById(table: string, id: number): Promise<Record> {
    return await this.db.selectSingle(
      table,
      `WHERE id=${this.engine.parameter(1)}`,
      [id],
    );
  }

  /** Inserts a row into a table. */
  public async insert(table: string, record: Record): Promise<Record> {
    return await this.db.insert(table, record);
  }

  /** Replaces a row in a table by numeric `id`. */
  public async update(
    table: string,
    id: number,
    record: Record,
  ): Promise<Record> {
    return await this.db.update(table, { ...record, id });
  }

  /** Deletes a row from a table by numeric `id`. */
  public async delete(table: string, id: number): Promise<Record> {
    return await this.db.delete(table, id);
  }

  /** Returns a single column value from a row identified by numeric `id`. */
  public async getColumnFromRecordbyId(
    table: string,
    id: number,
    column: string,
  ): Promise<string> {
    const record = await this.db.selectSingle(
      table,
      `WHERE id=${this.engine.parameter(1)}`,
      [id],
    );
    return record[column] ?? null;
  }

  /** Updates a single column on a row identified by numeric `id`. */
  public async updateColumnForRecordById(
    table: string,
    id: number,
    column: string,
    value: string,
  ): Promise<Record> {
    const record = { [column]: value };
    return await this.db.update(table, { ...record, id });
  }

  /** Generates engine-specific `CREATE TABLE` SQL for a proposed schema. */
  public async createTable(table: string, columns: ColumnDescription[]) {
    return this.engine.createTableSql(table, columns);
  }

  /** Executes raw SQL against the active connection. */
  public async execute(text: string, args: any[]) {
    return this.db.execute(text, args);
  }

  /** Returns the nearest BAG streets for a latitude/longitude pair. */
  public async nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]> {
    return await this.getLocationDatabase().nearestStreets(latitude, longitude);
  }

  /** Geocodes a street, house number, and city. */
  public async geocodeByAddress(
    street: string,
    houseNumber: number,
    city: string,
  ): Promise<GeocodedAddress[]> {
    return await this.getLocationDatabase().geocodeByAddress(
      street,
      houseNumber,
      city,
    );
  }

  /** Geocodes a postcode and house number. */
  public async geocodeByPostcode(
    postcode: string,
    houseNumber: number,
  ): Promise<GeocodedAddress[]> {
    return await this.getLocationDatabase().geocodeByPostcode(
      postcode,
      houseNumber,
    );
  }

  private getLocationDatabase(): LocationDatabase {
    if (!isLocationDatabase(this.db)) {
      throw new Error(
        'Location endpoints require a postgres connection with PostGIS-compatible BAG data.',
      );
    }

    return this.db;
  }
}

export type { ColumnDescription, TableSchemaDescription } from '../data/database-metadata';
export type { GeocodedAddress, NearestStreet } from '../data/location-database';
