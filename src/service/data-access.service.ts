import { Injectable } from '@nestjs/common';
import { Database, Record } from 'src/data/database';
import { databaseEngine } from '../db.conf';
import { createDatabase } from '../data/database-factory';

@Injectable()
export class DataAccessService {
  private db: Database = createDatabase();

  async getTableNames(): Promise<any[]> {
    const data = await this.db.execute(
      `
      SELECT table_name, table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_type ASC, table_name ASC
      `,
      [],
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

  async describeTable(table: string): Promise<TableSchemaDescription | null> {
    if (databaseEngine === 'mysql') {
      return await this.describeMySqlTable(table);
    }

    if (databaseEngine === 'postgres') {
      return await this.describePostgresTable(table);
    }

    return null;
  }

  private async describePostgresTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    const tableMetadata = await this.db.executeSingle<{
      table_name: string;
      table_schema: string;
      table_type: string;
    }>(
      `
      SELECT
        t.table_name,
        t.table_schema,
        t.table_type
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_name = $1
      `,
      [table],
    );

    if (!tableMetadata) {
      return null;
    }

    const columns = (
      await this.db.execute(
        `
        SELECT
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.udt_name,
          c.is_nullable = 'YES' AS is_nullable,
          c.column_default,
          c.is_identity = 'YES' AS is_identity,
          c.identity_generation,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = $1
        ORDER BY c.ordinal_position ASC
        `,
        [table],
      )
    ).rows.map((row) => ({
      ordinal_position: Number(row.ordinal_position),
      column_name: String(row.column_name),
      data_type: String(row.data_type),
      udt_name: String(row.udt_name),
      is_nullable: Boolean(row.is_nullable),
      column_default: row.column_default ? String(row.column_default) : null,
      is_identity: Boolean(row.is_identity),
      identity_generation: row.identity_generation
        ? String(row.identity_generation)
        : null,
      character_maximum_length:
        row.character_maximum_length != null
          ? Number(row.character_maximum_length)
          : null,
      numeric_precision:
        row.numeric_precision != null ? Number(row.numeric_precision) : null,
      numeric_scale:
        row.numeric_scale != null ? Number(row.numeric_scale) : null,
    }));

    const constraints = (
      await this.db.execute(
        `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          array_remove(
            array_agg(kcu.column_name ORDER BY kcu.ordinal_position),
            NULL
          ) AS columns,
          ccu.table_schema AS referenced_table_schema,
          ccu.table_name AS referenced_table,
          array_remove(
            array_agg(ccu.column_name ORDER BY kcu.ordinal_position),
            NULL
          ) AS referenced_columns,
          rc.update_rule,
          rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_name = rc.constraint_name
         AND tc.table_schema = rc.constraint_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.constraint_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
        GROUP BY
          tc.constraint_name,
          tc.constraint_type,
          ccu.table_schema,
          ccu.table_name,
          rc.update_rule,
          rc.delete_rule
        ORDER BY tc.constraint_type ASC, tc.constraint_name ASC
        `,
        [table],
      )
    ).rows.map((row) => {
      const isForeignKey = String(row.constraint_type) === 'FOREIGN KEY';

      return {
        constraint_name: String(row.constraint_name),
        constraint_type: String(row.constraint_type),
        columns: Array.isArray(row.columns)
          ? row.columns.map((column) => String(column))
          : [],
        referenced_table_schema:
          isForeignKey && row.referenced_table_schema
            ? String(row.referenced_table_schema)
            : null,
        referenced_table:
          isForeignKey && row.referenced_table
            ? String(row.referenced_table)
            : null,
        referenced_columns:
          isForeignKey && Array.isArray(row.referenced_columns)
            ? row.referenced_columns.map((column) => String(column))
            : [],
        update_rule:
          isForeignKey && row.update_rule ? String(row.update_rule) : null,
        delete_rule:
          isForeignKey && row.delete_rule ? String(row.delete_rule) : null,
      };
    });

    const indexes = (
      await this.db.execute(
        `
        SELECT
          i.indexname AS index_name,
          ix.indisunique AS is_unique,
          ix.indisprimary AS is_primary,
          am.amname AS method,
          pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
          ARRAY(
            SELECT a.attname
            FROM unnest(ix.indkey) WITH ORDINALITY AS cols(attnum, ord)
            JOIN pg_attribute a
              ON a.attrelid = ix.indrelid
             AND a.attnum = cols.attnum
            WHERE cols.attnum > 0
            ORDER BY cols.ord
          ) AS columns,
          i.indexdef AS definition
        FROM pg_indexes i
        JOIN pg_class t
          ON t.relname = i.tablename
        JOIN pg_namespace n
          ON n.oid = t.relnamespace
         AND n.nspname = i.schemaname
        JOIN pg_class ic
          ON ic.relname = i.indexname
         AND ic.relnamespace = n.oid
        JOIN pg_index ix
          ON ix.indexrelid = ic.oid
         AND ix.indrelid = t.oid
        JOIN pg_am am
          ON am.oid = ic.relam
        WHERE i.schemaname = 'public'
          AND i.tablename = $1
        ORDER BY ix.indisprimary DESC, ix.indisunique DESC, i.indexname ASC
        `,
        [table],
      )
    ).rows.map((row) => ({
      index_name: String(row.index_name),
      is_unique: Boolean(row.is_unique),
      is_primary: Boolean(row.is_primary),
      method: String(row.method),
      predicate: row.predicate ? String(row.predicate) : null,
      columns: Array.isArray(row.columns)
        ? row.columns.map((column) => String(column))
        : [],
      definition: String(row.definition),
    }));

    return {
      table_name: String(tableMetadata.table_name),
      table_schema: String(tableMetadata.table_schema),
      table_type: String(tableMetadata.table_type),
      columns,
      constraints,
      indexes,
    };
  }

  private async describeMySqlTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    const tableMetadata = await this.db.executeSingle<{
      table_name: string;
      table_schema: string;
      table_type: string;
    }>(
      `
      SELECT
        t.table_name,
        t.table_schema,
        t.table_type
      FROM information_schema.tables t
      WHERE t.table_schema = DATABASE()
        AND t.table_name = ?
      `,
      [table],
    );

    if (!tableMetadata) {
      return null;
    }

    const columns = (
      await this.db.execute(
        `
        SELECT
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.column_type AS udt_name,
          c.is_nullable = 'YES' AS is_nullable,
          c.column_default,
          c.extra LIKE '%auto_increment%' AS is_identity,
          NULL AS identity_generation,
          c.character_maximum_length,
          c.numeric_precision,
          c.numeric_scale
        FROM information_schema.columns c
        WHERE c.table_schema = DATABASE()
          AND c.table_name = ?
        ORDER BY c.ordinal_position ASC
        `,
        [table],
      )
    ).rows.map((row) => ({
      ordinal_position: Number(row.ordinal_position),
      column_name: String(row.column_name),
      data_type: String(row.data_type),
      udt_name: String(row.udt_name),
      is_nullable: Boolean(row.is_nullable),
      column_default: row.column_default ? String(row.column_default) : null,
      is_identity: Boolean(row.is_identity),
      identity_generation: null,
      character_maximum_length:
        row.character_maximum_length != null
          ? Number(row.character_maximum_length)
          : null,
      numeric_precision:
        row.numeric_precision != null ? Number(row.numeric_precision) : null,
      numeric_scale:
        row.numeric_scale != null ? Number(row.numeric_scale) : null,
    }));

    const constraints = (
      await this.db.execute(
        `
        SELECT
          tc.constraint_name,
          tc.constraint_type,
          GROUP_CONCAT(kcu.column_name ORDER BY kcu.ordinal_position SEPARATOR ',') AS columns_csv,
          MAX(kcu.referenced_table_schema) AS referenced_table_schema,
          MAX(kcu.referenced_table_name) AS referenced_table,
          GROUP_CONCAT(
            kcu.referenced_column_name
            ORDER BY kcu.ordinal_position
            SEPARATOR ','
          ) AS referenced_columns_csv,
          MAX(rc.update_rule) AS update_rule,
          MAX(rc.delete_rule) AS delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_schema = kcu.constraint_schema
         AND tc.table_name = kcu.table_name
         AND tc.constraint_name = kcu.constraint_name
        LEFT JOIN information_schema.referential_constraints rc
          ON tc.constraint_schema = rc.constraint_schema
         AND tc.constraint_name = rc.constraint_name
        WHERE tc.table_schema = DATABASE()
          AND tc.table_name = ?
        GROUP BY tc.constraint_name, tc.constraint_type
        ORDER BY tc.constraint_type ASC, tc.constraint_name ASC
        `,
        [table],
      )
    ).rows.map((row) => {
      const constraintType = String(row.constraint_type);
      const isForeignKey = constraintType === 'FOREIGN KEY';

      return {
        constraint_name: String(row.constraint_name),
        constraint_type: constraintType,
        columns: splitCsv(row.columns_csv),
        referenced_table_schema:
          isForeignKey && row.referenced_table_schema
            ? String(row.referenced_table_schema)
            : null,
        referenced_table:
          isForeignKey && row.referenced_table
            ? String(row.referenced_table)
            : null,
        referenced_columns:
          isForeignKey ? splitCsv(row.referenced_columns_csv) : [],
        update_rule:
          isForeignKey && row.update_rule ? String(row.update_rule) : null,
        delete_rule:
          isForeignKey && row.delete_rule ? String(row.delete_rule) : null,
      };
    });

    const indexes = (
      await this.db.execute(
        `
        SELECT
          s.index_name,
          s.non_unique = 0 AS is_unique,
          s.index_name = 'PRIMARY' AS is_primary,
          s.index_type AS method,
          GROUP_CONCAT(s.column_name ORDER BY s.seq_in_index SEPARATOR ',') AS columns_csv
        FROM information_schema.statistics s
        WHERE s.table_schema = DATABASE()
          AND s.table_name = ?
        GROUP BY
          s.index_name,
          s.non_unique,
          s.index_type
        ORDER BY
          is_primary DESC,
          is_unique DESC,
          s.index_name ASC
        `,
        [table],
      )
    ).rows.map((row) => {
      const columns = splitCsv(row.columns_csv);
      const isPrimary = Boolean(row.is_primary);
      const isUnique = Boolean(row.is_unique);
      const method = String(row.method);

      return {
        index_name: String(row.index_name),
        is_unique: isUnique,
        is_primary: isPrimary,
        method,
        predicate: null,
        columns,
        definition: buildMySqlIndexDefinition(
          String(row.index_name),
          columns,
          method,
          isPrimary,
          isUnique,
        ),
      };
    });

    return {
      table_name: String(tableMetadata.table_name),
      table_schema: String(tableMetadata.table_schema),
      table_type: String(tableMetadata.table_type),
      columns,
      constraints,
      indexes,
    };
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
    this.ensurePostgresLocationSupport();
    const hasWoonplaatsTable = await this.db.tableExists('bag_woonplaats');
    const data = await this.db.execute(
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
    this.ensurePostgresLocationSupport();
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
    this.ensurePostgresLocationSupport();
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

  private ensurePostgresLocationSupport() {
    if (databaseEngine !== 'postgres') {
      throw new Error(
        'Location endpoints require a postgres connection with PostGIS-compatible BAG data.',
      );
    }
  }
}

export interface ColumnDescription {
  name: string;
  type: string;
  nullable: boolean;
}

export interface TableSchemaColumn {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  column_default: string | null;
  is_identity: boolean;
  identity_generation: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

export interface TableSchemaConstraint {
  constraint_name: string;
  constraint_type: string;
  columns: string[];
  referenced_table_schema: string | null;
  referenced_table: string | null;
  referenced_columns: string[];
  update_rule: string | null;
  delete_rule: string | null;
}

export interface TableSchemaIndex {
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  method: string;
  predicate: string | null;
  columns: string[];
  definition: string;
}

export interface TableSchemaDescription {
  table_name: string;
  table_schema: string;
  table_type: string;
  columns: TableSchemaColumn[];
  constraints: TableSchemaConstraint[];
  indexes: TableSchemaIndex[];
}

function splitCsv(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildMySqlIndexDefinition(
  indexName: string,
  columns: string[],
  method: string,
  isPrimary: boolean,
  isUnique: boolean,
): string {
  const renderedColumns = columns.map((column) => `\`${column}\``).join(', ');

  if (isPrimary) {
    return `PRIMARY KEY USING ${method} (${renderedColumns})`;
  }

  if (isUnique) {
    return `UNIQUE INDEX \`${indexName}\` USING ${method} (${renderedColumns})`;
  }

  return `INDEX \`${indexName}\` USING ${method} (${renderedColumns})`;
}

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
