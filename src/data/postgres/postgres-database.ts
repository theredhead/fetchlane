import { Database, Record, RecordSet } from './../database';
import {
  GeocodedAddress,
  LocationDatabase,
  NearestStreet,
} from '../location-database';
import { Pool, PoolConfig, QueryResult } from 'pg';

export class PostgresDatabase implements Database, LocationDatabase {
  private readonly pool: Pool;

  constructor(private config: PoolConfig) {
    this.pool = new Pool(this.config);
  }

  quoteObjectName = (name: string): string => ['"', name, '"'].join('');

  private isCommandResult(result: QueryResult): boolean {
    return result.command !== 'SELECT' && result.rowCount != null;
  }

  async insert(table: string, record: Record): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const data: any = { ...record };
    delete data.id;
    const keys = Object.keys(data);
    const columns = keys.map(this.quoteObjectName).join(', ');
    const tokens = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map((key) => data[key]);

    const statement = `INSERT INTO ${quotedTableName} (${columns}) VALUES (${tokens}) RETURNING id`;
    const result = await this.execute(statement, values);

    const insertedId = result.rows[0]?.id ?? result.info?.insertId;
    return await this.selectSingle(table, 'WHERE id=$1', [insertedId]);
  }

  async update(table: string, record: Record): Promise<Record> {
    const id = record.id;
    const data: any = { ...record };
    delete data.id;
    const quotedTableName = this.quoteObjectName(table);
    const keys = Object.keys(data);
    const snippets = keys
      .map((col, i) => `${this.quoteObjectName(col)}=$${i + 1}`)
      .join(', ');
    const statement = `UPDATE ${quotedTableName} SET ${snippets} WHERE id=$${keys.length + 1}`;
    await this.execute(statement, [...Object.values(data), id]);
    return await this.selectSingle(table, 'WHERE id=$1', [id]);
  }

  async delete(table: string, id: number): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const record = await this.selectSingle(table, 'WHERE id=$1', [id]);
    await this.execute(`DELETE FROM ${quotedTableName} WHERE id=$1`, [id]);
    return record;
  }

  async select(
    table: string,
    additional = '',
    args: any[] = [],
  ): Promise<RecordSet> {
    const quotedTableName = this.quoteObjectName(table);
    return await this.execute(
      `SELECT * FROM ${quotedTableName} ${additional}`,
      args,
    );
  }

  async selectSingle(
    table: string,
    additional: string,
    args: any[],
  ): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const result = await this.execute(
      `SELECT * FROM ${quotedTableName} ${additional} LIMIT 1`,
      args,
    );
    return result.rows.shift();
  }

  async execute(statement: string, args: any[] = []): Promise<RecordSet> {
    const client = await this.pool.connect();
    try {
      const pgResult = await client.query(statement, args);

      const result: RecordSet = {
        info: {},
        fields: pgResult.fields,
        rows: [],
      };

      if (this.isCommandResult(pgResult)) {
        result.info = {
          affectedRows: pgResult.rowCount,
          insertId: pgResult.rows?.[0]?.id,
        };
        if (pgResult.rows?.length) {
          result.rows = pgResult.rows;
        }
      } else {
        result.rows = pgResult.rows ?? [];
      }

      return result;
    } finally {
      client.release();
    }
  }

  async executeSingle<T>(statement: string, args: any[] = []): Promise<T> {
    const result = (await this.execute(statement, args)).rows;
    return <T>(<any[]>result).shift();
  }

  async executeScalar<T>(statement: string, args: any[] = []): Promise<T> {
    const result = await this.executeSingle(statement, args);
    const key = Object.keys(result).shift();
    const scalar = (<any>result)[key];
    return <T>(<unknown>scalar);
  }

  async tableExists(tableName: string): Promise<boolean> {
    const count = await this.executeScalar<string>(
      `SELECT COUNT(*)::int FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [tableName],
    );
    return Number(count) === 1;
  }

  async nearestStreets(
    latitude: number,
    longitude: number,
  ): Promise<NearestStreet[]> {
    const hasWoonplaatsTable = await this.tableExists('bag_woonplaats');
    const data = await this.execute(
      hasWoonplaatsTable
        ? `
          WITH input AS (
            SELECT ST_Transform(
              ST_SetSRID(ST_Point($1, $2), 4326),
              28992
            ) AS geom
          ),
          candidates AS (
            SELECT
              b.openbareruimte_id,
              b.straatnaam,
              b.woonplaats_id,
              w.naam AS woonplaats,
              b.geom,
              ST_Distance(b.geom, input.geom) AS distance_m
            FROM bag_street_points b
            LEFT JOIN bag_woonplaats w ON w.identificatie = b.woonplaats_id
            CROSS JOIN input
            ORDER BY b.geom <-> input.geom
            LIMIT 1000
          ),
          ranked AS (
            SELECT
              openbareruimte_id,
              straatnaam,
              woonplaats_id,
              woonplaats,
              geom,
              distance_m,
              ROW_NUMBER() OVER (
                PARTITION BY openbareruimte_id
                ORDER BY distance_m ASC, straatnaam ASC
              ) AS row_num
            FROM candidates
          )
          SELECT
            openbareruimte_id,
            straatnaam,
            woonplaats_id,
            woonplaats,
            ST_Y(ST_Transform(geom, 4326)) AS latitude,
            ST_X(ST_Transform(geom, 4326)) AS longitude,
            distance_m
          FROM ranked
          WHERE row_num = 1
          ORDER BY distance_m ASC
          LIMIT 5
          `
        : `
          WITH input AS (
            SELECT ST_Transform(
              ST_SetSRID(ST_Point($1, $2), 4326),
              28992
            ) AS geom
          ),
          candidates AS (
            SELECT
              b.openbareruimte_id,
              b.straatnaam,
              b.woonplaats_id,
              NULL::text AS woonplaats,
              b.geom,
              ST_Distance(b.geom, input.geom) AS distance_m
            FROM bag_street_points b
            CROSS JOIN input
            ORDER BY b.geom <-> input.geom
            LIMIT 1000
          ),
          ranked AS (
            SELECT
              openbareruimte_id,
              straatnaam,
              woonplaats_id,
              woonplaats,
              geom,
              distance_m,
              ROW_NUMBER() OVER (
                PARTITION BY openbareruimte_id
                ORDER BY distance_m ASC, straatnaam ASC
              ) AS row_num
            FROM candidates
          )
          SELECT
            openbareruimte_id,
            straatnaam,
            woonplaats_id,
            woonplaats,
            ST_Y(ST_Transform(geom, 4326)) AS latitude,
            ST_X(ST_Transform(geom, 4326)) AS longitude,
            distance_m
          FROM ranked
          WHERE row_num = 1
          ORDER BY distance_m ASC
          LIMIT 5
          `,
      [longitude, latitude],
    );

    return data.rows.map((row) => ({
      openbareruimte_id: String(row.openbareruimte_id),
      straatnaam: String(row.straatnaam),
      woonplaats_id: row.woonplaats_id ? String(row.woonplaats_id) : null,
      woonplaats: row.woonplaats ? String(row.woonplaats) : null,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      distance_m: Number(row.distance_m),
    }));
  }

  async geocodeByAddress(
    street: string,
    houseNumber: number,
    city: string,
  ): Promise<GeocodedAddress[]> {
    const hasWoonplaatsTable = await this.tableExists('bag_woonplaats');
    const data = await this.execute(
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
    const hasWoonplaatsTable = await this.tableExists('bag_woonplaats');
    const data = await this.execute(
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

  release(): void {
    this.pool.end();
  }
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
