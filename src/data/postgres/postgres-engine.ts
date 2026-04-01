import { ParsedDatabaseUrl } from '../../db.conf';
import { Database, Record } from '../database';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../database-metadata';
import { DatabaseEngine } from '../database-engine';

/**
 * PostgreSQL-specific SQL and metadata behavior used by the generic data-access layer.
 */
export const postgresDatabaseEngine: DatabaseEngine = {
  name: 'postgres',
  engines: ['postgres', 'postgresql'],

  async connectDatabase(config: ParsedDatabaseUrl): Promise<Database> {
    const { PostgresDatabase } = await import('./postgres-database');

    return new PostgresDatabase({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port || 5432,
      database: config.database,
    });
  },

  quoteIdentifier(name: string): string {
    return ['"', name, '"'].join('');
  },

  parameter(index: number): string {
    return `$${index}`;
  },

  paginateQuery(
    baseQuery: string,
    limit: number,
    offset: number,
    orderByClause: string | null,
  ): string {
    return [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
      .filter(Boolean)
      .join('\n');
  },

  async getTableNames(db: Database): Promise<Record[]> {
    return (
      await db.execute(
        `
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_type ASC, table_name ASC
        `,
        [],
      )
    ).rows;
  },

  async getTableInfo(db: Database, table: string): Promise<Record[]> {
    return (
      await db.execute(
        `
        SELECT c.*
        FROM information_schema.columns c
        WHERE c.table_schema = 'public'
          AND c.table_name = $1
        ORDER BY c.ordinal_position ASC
        `,
        [table],
      )
    ).rows;
  },

  async describeTable(
    db: Database,
    table: string,
  ): Promise<TableSchemaDescription | null> {
    const tableMetadata = await db.executeSingle<{
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
      await db.execute(
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
      await db.execute(
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
      await db.execute(
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
  },

  createTableSql(table: string, columns: ColumnDescription[]): string {
    const lines = [
      `CREATE TABLE ${this.quoteIdentifier(table)} (`,
      `  ${this.quoteIdentifier('id')} integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`,
    ];

    columns.forEach((column, index) => {
      const nullable = column.nullable ? '' : ' NOT NULL';
      const suffix = index === columns.length - 1 ? '' : ',';
      lines.push(
        `  ${this.quoteIdentifier(column.name)} ${column.type}${nullable}${suffix}`,
      );
    });

    lines.push(')');
    return lines.join('\n');
  },
};
