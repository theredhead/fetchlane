import { ParsedDatabaseUrl } from '../../db.conf';
import { Database, Record } from '../database';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../database-metadata';
import { DatabaseEngine } from '../database-engine';

export const sqlServerDatabaseEngine: DatabaseEngine = {
  name: 'sqlserver',
  engines: ['sqlserver', 'mssql'],

  async connectDatabase(config: ParsedDatabaseUrl): Promise<Database> {
    const { SqlServerDatabase } = await import('./sqlserver-database');

    return new SqlServerDatabase({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port || 1433,
      database: config.database,
    });
  },

  quoteIdentifier(name: string): string {
    return ['[', name, ']'].join('');
  },

  parameter(index: number): string {
    return `@p${index}`;
  },

  paginateQuery(
    baseQuery: string,
    limit: number,
    offset: number,
    orderByClause: string | null,
  ): string {
    const rowStart = offset + 1;
    const rowEnd = offset + limit;
    const ordering = orderByClause || 'ORDER BY (SELECT NULL)';

    return `
      SELECT *
      FROM (
        SELECT
          paged_source.*,
          ROW_NUMBER() OVER (${ordering}) AS row_index
        FROM (
          ${baseQuery}
        ) AS paged_source
      ) AS paged_result
      WHERE row_index BETWEEN ${rowStart} AND ${rowEnd}
      ORDER BY row_index
    `.trim();
  },

  async getTableNames(db: Database): Promise<Record[]> {
    return (
      await db.execute(
        `
        SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = SCHEMA_NAME()
        ORDER BY TABLE_TYPE ASC, TABLE_NAME ASC
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
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = SCHEMA_NAME()
          AND c.TABLE_NAME = @p1
        ORDER BY c.ORDINAL_POSITION ASC
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
        t.TABLE_NAME AS table_name,
        t.TABLE_SCHEMA AS table_schema,
        t.TABLE_TYPE AS table_type
      FROM INFORMATION_SCHEMA.TABLES t
      WHERE t.TABLE_SCHEMA = SCHEMA_NAME()
        AND t.TABLE_NAME = @p1
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
          c.ORDINAL_POSITION AS ordinal_position,
          c.COLUMN_NAME AS column_name,
          c.DATA_TYPE AS data_type,
          COALESCE(c.DOMAIN_NAME, c.DATA_TYPE) AS udt_name,
          CASE WHEN c.IS_NULLABLE = 'YES' THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS is_nullable,
          c.COLUMN_DEFAULT AS column_default,
          COLUMNPROPERTY(
            OBJECT_ID(QUOTENAME(c.TABLE_SCHEMA) + '.' + QUOTENAME(c.TABLE_NAME)),
            c.COLUMN_NAME,
            'IsIdentity'
          ) AS is_identity,
          NULL AS identity_generation,
          c.CHARACTER_MAXIMUM_LENGTH AS character_maximum_length,
          c.NUMERIC_PRECISION AS numeric_precision,
          c.NUMERIC_SCALE AS numeric_scale
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = SCHEMA_NAME()
          AND c.TABLE_NAME = @p1
        ORDER BY c.ORDINAL_POSITION ASC
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
      await db.execute(
        `
        SELECT
          tc.CONSTRAINT_NAME AS constraint_name,
          tc.CONSTRAINT_TYPE AS constraint_type,
          STRING_AGG(kcu.COLUMN_NAME, ',') WITHIN GROUP (ORDER BY kcu.ORDINAL_POSITION) AS columns_csv,
          MAX(ccu.TABLE_SCHEMA) AS referenced_table_schema,
          MAX(ccu.TABLE_NAME) AS referenced_table,
          STRING_AGG(ccu.COLUMN_NAME, ',') WITHIN GROUP (ORDER BY kcu.ORDINAL_POSITION) AS referenced_columns_csv,
          MAX(fk.update_referential_action_desc) AS update_rule,
          MAX(fk.delete_referential_action_desc) AS delete_rule
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
         AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
         AND tc.TABLE_NAME = kcu.TABLE_NAME
        LEFT JOIN INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
          ON tc.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
         AND tc.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
        LEFT JOIN INFORMATION_SCHEMA.CONSTRAINT_COLUMN_USAGE ccu
          ON rc.UNIQUE_CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
         AND rc.UNIQUE_CONSTRAINT_SCHEMA = ccu.CONSTRAINT_SCHEMA
        LEFT JOIN sys.foreign_keys fk
          ON fk.name = tc.CONSTRAINT_NAME
        WHERE tc.TABLE_SCHEMA = SCHEMA_NAME()
          AND tc.TABLE_NAME = @p1
        GROUP BY tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE
        ORDER BY tc.CONSTRAINT_TYPE ASC, tc.CONSTRAINT_NAME ASC
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
      await db.execute(
        `
        SELECT
          i.name AS index_name,
          i.is_unique AS is_unique,
          i.is_primary_key AS is_primary,
          i.type_desc AS method,
          STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS columns_csv
        FROM sys.indexes i
        JOIN sys.index_columns ic
          ON i.object_id = ic.object_id
         AND i.index_id = ic.index_id
        JOIN sys.columns c
          ON ic.object_id = c.object_id
         AND ic.column_id = c.column_id
        JOIN sys.tables t
          ON i.object_id = t.object_id
        JOIN sys.schemas s
          ON t.schema_id = s.schema_id
        WHERE s.name = SCHEMA_NAME()
          AND t.name = @p1
          AND i.name IS NOT NULL
          AND ic.key_ordinal > 0
        GROUP BY i.name, i.is_unique, i.is_primary_key, i.type_desc
        ORDER BY i.is_primary_key DESC, i.is_unique DESC, i.name ASC
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
        definition: buildSqlServerIndexDefinition(
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
  },

  createTableSql(table: string, columns: ColumnDescription[]): string {
    const lines = [
      `CREATE TABLE ${this.quoteIdentifier(table)} (`,
      `  ${this.quoteIdentifier('id')} int IDENTITY(1,1) PRIMARY KEY,`,
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

function splitCsv(value: unknown): string[] {
  if (value == null) {
    return [];
  }

  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildSqlServerIndexDefinition(
  indexName: string,
  columns: string[],
  method: string,
  isPrimary: boolean,
  isUnique: boolean,
): string {
  const renderedColumns = columns.map((column) => `[${column}]`).join(', ');

  if (isPrimary) {
    return `PRIMARY KEY ${method} (${renderedColumns})`;
  }

  if (isUnique) {
    return `UNIQUE INDEX [${indexName}] ${method} (${renderedColumns})`;
  }

  return `INDEX [${indexName}] ${method} (${renderedColumns})`;
}
