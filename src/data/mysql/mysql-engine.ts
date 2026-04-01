import { ParsedDatabaseUrl } from '../../db.conf';
import { Database, Record } from '../database';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../database-metadata';
import { DatabaseEngine } from '../database-engine';

export const mySqlDatabaseEngine: DatabaseEngine = {
  name: 'mysql',
  engines: ['mysql'],

  async connectDatabase(config: ParsedDatabaseUrl): Promise<Database> {
    const { MySqlDatabase } = await import('./mysql-database');

    return new MySqlDatabase({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port || 3306,
      database: config.database,
    });
  },

  quoteIdentifier(name: string): string {
    return ['`', name, '`'].join('');
  },

  parameter(): string {
    return '?';
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
        WHERE table_schema = DATABASE()
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
        WHERE c.table_schema = DATABASE()
          AND c.table_name = ?
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
      WHERE t.table_schema = DATABASE()
        AND t.table_name = ?
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
      await db.execute(
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
      await db.execute(
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
  },

  createTableSql(table: string, columns: ColumnDescription[]): string {
    const lines = [
      `CREATE TABLE ${this.quoteIdentifier(table)} (`,
      `  ${this.quoteIdentifier('id')} integer AUTO_INCREMENT PRIMARY KEY,`,
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
