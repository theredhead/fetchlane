import { createRequire } from 'node:module';
import { ParsedDatabaseUrl } from '../../db.conf';
import { formatDeveloperError } from '../../errors/api-error';
import {
  DatabaseAdapter,
  Record,
  RecordSet,
  SupportsCreateTableSql,
  SupportsSchemaDescription,
  SupportsTableInfo,
  SupportsTableListing,
} from '../database';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../database-metadata';

/**
 * MySQL adapter implementation.
 */
export class MySqlDatabase
  implements
    DatabaseAdapter,
    SupportsTableListing,
    SupportsTableInfo,
    SupportsSchemaDescription,
    SupportsCreateTableSql
{
  /**
   * Canonical adapter name used for registration and logging.
   */
  public static readonly adapterName = 'mysql';
  /**
   * Connection URL engine aliases matched by this adapter.
   */
  public static readonly engines = ['mysql'] as const;

  /**
   * Runtime adapter name exposed to callers.
   */
  public readonly name = MySqlDatabase.adapterName;

  private poolPromise: Promise<any> | null = null;

  /**
   * Creates a pooled MySQL adapter.
   */
  public constructor(private readonly config: ParsedDatabaseUrl) {}

  /**
   * Quotes an identifier using MySQL rules.
   */
  public quoteIdentifier(name: string): string {
    return ['`', name.replace(/`/g, '``'), '`'].join('');
  }

  /**
   * Returns the native MySQL parameter token.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public parameter(_index: number): string {
    return '?';
  }

  /**
   * Applies MySQL pagination syntax.
   */
  public paginateQuery(
    baseQuery: string,
    limit: number,
    offset: number,
    orderByClause: string | null,
  ): string {
    return [baseQuery, orderByClause, `LIMIT ${limit} OFFSET ${offset}`]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * @inheritdoc
   */
  public async insert(table: string, record: Record): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const data: Record = { ...record };
    delete data.id;
    const keys = Object.keys(data);
    const columns = keys.map((key) => this.quoteIdentifier(key)).join(', ');
    const tokens = keys.map(() => this.parameter(1)).join(', ');
    const values = keys.map((key) => data[key]);

    const statement = `INSERT INTO ${quotedTableName} (${columns}) VALUES (${tokens});`;
    const result = await this.execute(statement, values);
    return await this.selectSingle(table, 'WHERE id=?', [
      result.info?.insertId,
    ]);
  }

  /**
   * @inheritdoc
   */
  public async update(table: string, record: Record): Promise<Record> {
    const id = record.id;
    const data: Record = { ...record };
    delete data.id;
    const quotedTableName = this.quoteIdentifier(table);
    const snippets = Object.keys(data)
      .map((column) => `${this.quoteIdentifier(column)}=?`)
      .join(', ');
    const statement = `UPDATE ${quotedTableName} SET ${snippets} WHERE id=?`;

    await this.execute(statement, [...Object.values(data), id]);
    return await this.selectSingle(table, 'WHERE id=?', [id]);
  }

  /**
   * @inheritdoc
   */
  public async delete(table: string, id: number): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const record = await this.selectSingle(table, 'WHERE id=?', [id]);
    await this.execute(`DELETE FROM ${quotedTableName} WHERE id=?`, [id]);
    return record;
  }

  /**
   * @inheritdoc
   */
  public async select(
    table: string,
    additional = '',
    args: any[] = [],
  ): Promise<RecordSet> {
    const quotedTableName = this.quoteIdentifier(table);
    return await this.execute(
      `SELECT * FROM ${quotedTableName} ${additional}`,
      args,
    );
  }

  /**
   * @inheritdoc
   */
  public async selectSingle(
    table: string,
    additional: string,
    args: any[],
  ): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const result = await this.execute(
      `SELECT * FROM ${quotedTableName} ${additional} LIMIT 1`,
      args,
    );
    return result.rows.shift();
  }

  /**
   * @inheritdoc
   */
  public async execute(
    statement: string,
    args: any[] = [],
  ): Promise<RecordSet> {
    const pool = await this.getPool();

    return await new Promise((resolve, reject) => {
      pool.getConnection((connectionError: Error | null, connection: any) => {
        if (connectionError || !connection) {
          reject(
            connectionError ??
              new Error('Failed to acquire a MySQL connection.'),
          );
          return;
        }

        connection.query(
          statement,
          args,
          (queryError: Error | null, rows: any, fields: any) => {
            try {
              if (queryError) {
                reject(queryError);
                return;
              }

              const normalizedFields = Array.isArray(fields)
                ? fields.flatMap((field) =>
                    Array.isArray(field) ? field : field ? [field] : [],
                  )
                : [];

              const result: RecordSet = {
                info: {},
                rows: [],
                fields: normalizedFields.map((field) => ({
                  name: field.name,
                  flags: field.flags,
                  type: field.type ?? field.columnType,
                  length: field.length ?? field.columnLength,
                  default: field.default,
                })),
              };

              if (this.isResultSetHeader(rows)) {
                result.info = { ...rows };
                rows = [];
              } else if (this.isResultSetHeader(rows?.[0])) {
                result.info = rows.shift();
              }

              if (rows?.length) {
                result.rows = rows as Record[];
              }

              resolve(result);
            } catch (throwable) {
              reject(throwable);
            } finally {
              connection.release();
            }
          },
        );
      });
    });
  }

  /**
   * @inheritdoc
   */
  public async executeSingle<T>(
    statement: string,
    args: any[] = [],
  ): Promise<T> {
    const result = (await this.execute(statement, args)).rows;
    return result.shift() as T;
  }

  /**
   * @inheritdoc
   */
  public async executeScalar<T>(
    statement: string,
    args: any[] = [],
  ): Promise<T> {
    const result = await this.executeSingle<Record>(statement, args);
    const key = Object.keys(result).shift();
    return result[key as keyof Record] as T;
  }

  /**
   * @inheritdoc
   */
  public async tableExists(tableName: string): Promise<boolean> {
    const count = await this.executeScalar<number>(
      `
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
      `,
      [tableName],
    );
    return Number(count) === 1;
  }

  /**
   * Lists user-visible tables.
   */
  public async getTableNames(): Promise<Record[]> {
    return (
      await this.execute(
        `
        SELECT table_name, table_type
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY table_type ASC, table_name ASC
        `,
        [],
      )
    ).rows;
  }

  /**
   * Returns basic column metadata for a table.
   */
  public async getTableInfo(table: string): Promise<Record[]> {
    return (
      await this.execute(
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
  }

  /**
   * Returns normalized schema metadata for a table.
   */
  public async describeTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    const tableMetadata = await this.executeSingle<{
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
      await this.execute(
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
      await this.execute(
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
        referenced_columns: isForeignKey
          ? splitCsv(row.referenced_columns_csv)
          : [],
        update_rule:
          isForeignKey && row.update_rule ? String(row.update_rule) : null,
        delete_rule:
          isForeignKey && row.delete_rule ? String(row.delete_rule) : null,
      };
    });

    const indexes = (
      await this.execute(
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

  /**
   * Generates MySQL `CREATE TABLE` SQL.
   */
  public createTableSql(table: string, columns: ColumnDescription[]): string {
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
  }

  /**
   * @inheritdoc
   */
  public release(): void {
    if (!this.poolPromise) {
      return;
    }

    void this.poolPromise.then((pool) => pool.end()).catch(() => undefined);
    this.poolPromise = null;
  }

  private isResultSetHeader(value: unknown): boolean {
    if (value == null) {
      return false;
    }

    const fields = [
      'fieldCount',
      'affectedRows',
      'insertId',
      'info',
      'serverStatus',
      'warningStatus',
    ];

    let matches = 0;
    for (const field of fields) {
      if (Object.prototype.hasOwnProperty.call(value, field)) {
        matches++;
      }
    }

    return matches > 2;
  }

  private async getPool(): Promise<any> {
    if (!this.poolPromise) {
      this.poolPromise = this.createPool().catch((error) => {
        this.poolPromise = null;
        throw error;
      });
    }

    return await this.poolPromise;
  }

  private async createPool(): Promise<any> {
    const mysqlModule = await loadMySqlModule();
    return mysqlModule.createPool({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port || 3306,
      database: this.config.database,
      multipleStatements: true,
    });
  }
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

  return `${isUnique ? 'UNIQUE ' : ''}INDEX \`${indexName}\` USING ${method} (${renderedColumns})`;
}

/**
 * Loads the optional MySQL driver module and normalizes its export shape.
 */
async function loadMySqlModule(): Promise<any> {
  try {
    const moduleNamespace = await loadOptionalModule('mysql2');
    const mysqlModule = moduleNamespace.default ?? moduleNamespace;

    if (!mysqlModule?.createPool) {
      throw new Error(
        formatDeveloperError(
          'The MySQL driver "mysql2" did not expose createPool as expected.',
          'Reinstall the "mysql2" package and make sure the installed version matches the supported API surface.',
        ),
      );
    }

    return mysqlModule;
  } catch (error) {
    if (isMissingModuleError(error, 'mysql2')) {
      throw new Error(
        formatDeveloperError(
          'MySQL support requires the optional dependency "mysql2".',
          'Install it with `npm install mysql2` and restart the service.',
        ),
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown MySQL driver load failure.';

    throw new Error(
      formatDeveloperError(
        'Failed to load the MySQL driver "mysql2".',
        'Check that the "mysql2" package is installed correctly and that Node can resolve it from this project.',
        message,
      ),
    );
  }
}

/**
 * Loads an optional dependency using Node's CommonJS resolver.
 */
async function loadOptionalModule(moduleName: string): Promise<any> {
  const require = createRequire(__filename);
  return require(moduleName);
}

/**
 * Detects whether a driver load failure was caused by a missing module.
 */
function isMissingModuleError(error: unknown, moduleName: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const errorCode = (error as NodeJS.ErrnoException).code;
  const message = error.message ?? '';

  return (
    errorCode === 'MODULE_NOT_FOUND' ||
    errorCode === 'ERR_MODULE_NOT_FOUND' ||
    message.includes(`'${moduleName}'`) ||
    message.includes(`"${moduleName}"`) ||
    message.includes(`Cannot find package '${moduleName}'`) ||
    message.includes(`Cannot find module '${moduleName}'`)
  );
}
