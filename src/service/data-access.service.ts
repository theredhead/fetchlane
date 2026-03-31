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
export class DataAccessService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: Database,
    @Inject(ACTIVE_DATABASE_ENGINE)
    private readonly engine: DatabaseEngine,
  ) {}

  async getTableNames(): Promise<any[]> {
    return await this.engine.getTableNames(this.db);
  }

  async tableInfo(table: string): Promise<any> {
    return await this.engine.getTableInfo(this.db, table);
  }

  async describeTable(table: string): Promise<TableSchemaDescription | null> {
    return await this.engine.describeTable(this.db, table);
  }

  async index(
    table: string,
    pageIndex = 0,
    pageSize = 1000,
  ): Promise<Record[]> {
    const parsedPageIndex = Number(pageIndex);
    const parsedPageSize = Number(pageSize);
    const offset = parsedPageIndex * parsedPageSize;
    const data = await this.db.select(
      table,
      `LIMIT ${parsedPageSize} OFFSET ${offset}`,
      [],
    );
    return data.rows;
  }

  async selectSingleById(table: string, id: number): Promise<Record> {
    return await this.db.selectSingle(
      table,
      `WHERE id=${this.engine.parameter(1)}`,
      [id],
    );
  }

  async insert(table: string, record: Record): Promise<Record> {
    return await this.db.insert(table, record);
  }

  async update(table: string, id: number, record: Record): Promise<Record> {
    return await this.db.update(table, { ...record, id });
  }

  async delete(table: string, id: number): Promise<Record> {
    return await this.db.delete(table, id);
  }

  async getColumnFromRecordbyId(
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

  async updateColumnForRecordById(
    table: string,
    id: number,
    column: string,
    value: string,
  ): Promise<Record> {
    const record = { [column]: value };
    return await this.db.update(table, { ...record, id });
  }

  async createTable(table: string, columns: ColumnDescription[]) {
    return this.engine.createTableSql(table, columns);
  }

  async execute(text: string, args: any[]) {
    return this.db.execute(text, args);
  }

  async nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]> {
    return await this.getLocationDatabase().nearestStreets(latitude, longitude);
  }

  async geocodeByAddress(
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

  async geocodeByPostcode(
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
