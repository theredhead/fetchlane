import { Injectable } from '@nestjs/common';
import { Record } from 'src/data/database';
import { databaseConfiguration, pgDatabaseConfiguration } from '../db.conf';
import { MySqlDatabase } from './../data/mysql/mysql-database';
import { PostgresDatabase } from 'src/data/postgres/postgres-database';

@Injectable()
export class DataAccessService {
  // private db = new MySqlDatabase(databaseConfiguration);
  private db = new PostgresDatabase(pgDatabaseConfiguration);

  async getTableNames(): Promise<any[]> {
    const data = await this.db.execute(
      `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_type ASC, table_name ASC
      `,
    );

    return data.rows;
  }

  async tableInfo(table: string): Promise<any> {
    const data = await this.db.execute(
      `
      SELECT c.*
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
        AND c.table_name = $1
      ORDER BY c.ordinal_position ASC
    `,
      [table],
    );
    return data.rows;
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
    );
    return data.rows;
  }

  async selectSingleById(table: string, id: number): Promise<Record> {
    return await this.db.selectSingle(table, 'WHERE id=$1', [id]);
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
    const record = await this.db.selectSingle(table, 'WHERE id=$1', [id]);
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

  async createTable(table: string, columns: any[]) {
    const lines = [
      `CREATE TABLE ${table} (`,
      ` id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`,
    ];

    for (const col of columns) {
      const nullable = (col?.nullable ?? false) ? '' : ' NOT NULL';
      lines.push(` ${col.name} ${col.type} ${nullable}`);
    }
    lines.push(')');
    const script = lines.join('\n');

    return script;
    // await this.db.execute(script);
  }

  async execute(text: string, args: any[]) {
    return this.db.execute(text, args);
  }

  async nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]> {
    const data = await this.db.execute(
      `
      WITH input AS (
        SELECT ST_Transform(
          ST_SetSRID(ST_Point($1, $2), 4326),
          28992
        ) AS geom
      ),
      candidates AS (
        SELECT
          b.straatnaam,
          ST_Distance(b.geom, input.geom) AS distance_m
        FROM bag_street_points b
        CROSS JOIN input
        ORDER BY b.geom <-> input.geom
        LIMIT 1000
      )
      SELECT
        straatnaam,
        MIN(distance_m) AS distance_m
      FROM candidates
      GROUP BY straatnaam
      ORDER BY distance_m ASC
      LIMIT 5
      `,
      [longitude, latitude],
    );

    return data.rows.map((row) => ({
      straatnaam: String(row.straatnaam),
      distance_m: Number(row.distance_m),
    }));
  }

  async geocodeByAddress(
    street: string,
    houseNumber: number,
    city: string,
  ): Promise<GeocodedAddress[]> {
    const hasWoonplaatsTable = await this.db.tableExists('bag_woonplaats');
    const data = await this.db.execute(
      hasWoonplaatsTable
        ? `
          SELECT
            o.naam AS straatnaam,
            n.huisnummer,
            n.huisletter,
            n.huisnummertoevoeging,
            n.postcode,
            w.naam AS woonplaats,
            ST_Y(ST_Transform(v.geom, 4326)) AS latitude,
            ST_X(ST_Transform(v.geom, 4326)) AS longitude
          FROM bag_verblijfsobject v
          JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
          JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
          LEFT JOIN bag_woonplaats w ON w.identificatie = o.woonplaats_id
          WHERE lower(o.naam) = lower($1)
            AND n.huisnummer = $2
            AND lower(w.naam) = lower($3)
          ORDER BY
            n.huisletter ASC NULLS FIRST,
            n.huisnummertoevoeging ASC NULLS FIRST,
            v.identificatie ASC
          `
        : `
          SELECT
            o.naam AS straatnaam,
            n.huisnummer,
            n.huisletter,
            n.huisnummertoevoeging,
            n.postcode,
            NULL::text AS woonplaats,
            ST_Y(ST_Transform(v.geom, 4326)) AS latitude,
            ST_X(ST_Transform(v.geom, 4326)) AS longitude
          FROM bag_verblijfsobject v
          JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
          JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
          WHERE lower(o.naam) = lower($1)
            AND n.huisnummer = $2
          ORDER BY
            n.huisletter ASC NULLS FIRST,
            n.huisnummertoevoeging ASC NULLS FIRST,
            v.identificatie ASC
          `,
      hasWoonplaatsTable ? [street, houseNumber, city] : [street, houseNumber],
    );

    return data.rows.map(mapGeocodedAddress);
  }

  async geocodeByPostcode(
    postcode: string,
    houseNumber: number,
  ): Promise<GeocodedAddress[]> {
    const normalizedPostcode = postcode.replace(/\s+/g, '').toUpperCase();
    const hasWoonplaatsTable = await this.db.tableExists('bag_woonplaats');
    const data = await this.db.execute(
      hasWoonplaatsTable
        ? `
          SELECT
            o.naam AS straatnaam,
            n.huisnummer,
            n.huisletter,
            n.huisnummertoevoeging,
            n.postcode,
            w.naam AS woonplaats,
            ST_Y(ST_Transform(v.geom, 4326)) AS latitude,
            ST_X(ST_Transform(v.geom, 4326)) AS longitude
          FROM bag_verblijfsobject v
          JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
          JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
          LEFT JOIN bag_woonplaats w ON w.identificatie = o.woonplaats_id
          WHERE replace(upper(n.postcode), ' ', '') = $1
            AND n.huisnummer = $2
          ORDER BY
            n.huisletter ASC NULLS FIRST,
            n.huisnummertoevoeging ASC NULLS FIRST,
            v.identificatie ASC
          `
        : `
          SELECT
            o.naam AS straatnaam,
            n.huisnummer,
            n.huisletter,
            n.huisnummertoevoeging,
            n.postcode,
            NULL::text AS woonplaats,
            ST_Y(ST_Transform(v.geom, 4326)) AS latitude,
            ST_X(ST_Transform(v.geom, 4326)) AS longitude
          FROM bag_verblijfsobject v
          JOIN bag_nummeraanduiding n ON n.identificatie = v.nummeraanduiding_id
          JOIN bag_openbareruimte o ON o.identificatie = n.openbareruimte_id
          WHERE replace(upper(n.postcode), ' ', '') = $1
            AND n.huisnummer = $2
          ORDER BY
            n.huisletter ASC NULLS FIRST,
            n.huisnummertoevoeging ASC NULLS FIRST,
            v.identificatie ASC
          `,
      [normalizedPostcode, houseNumber],
    );

    return data.rows.map(mapGeocodedAddress);
  }
}

export interface ColumnDescription {
  name: string;
  type: string;
  nullable: boolean;
}

export interface NearestStreet {
  straatnaam: string;
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

function mapGeocodedAddress(row: Record): GeocodedAddress {
  return {
    straatnaam: String(row.straatnaam),
    huisnummer: Number(row.huisnummer),
    huisletter: row.huisletter ? String(row.huisletter) : null,
    huisnummertoevoeging: row.huisnummertoevoeging
      ? String(row.huisnummertoevoeging)
      : null,
    postcode: row.postcode ? String(row.postcode) : null,
    woonplaats: row.woonplaats ? String(row.woonplaats) : null,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  };
}
