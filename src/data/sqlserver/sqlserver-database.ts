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
 * SQL Server adapter implementation.
 */
export class SqlServerDatabase
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
  public static readonly adapterName = 'sqlserver';
  /**
   * Connection URL engine aliases matched by this adapter.
   */
  public static readonly engines = ['sqlserver', 'mssql'] as const;

  /**
   * Runtime adapter name exposed to callers.
   */
  public readonly name = SqlServerDatabase.adapterName;

  private poolPromise: Promise<any> | null = null;

  /**
   * Creates a pooled SQL Server adapter.
   */
  public constructor(private readonly config: ParsedDatabaseUrl) {}

  /**
   * Quotes an identifier using SQL Server rules.
   */
  public quoteIdentifier(name: string): string {
    return ['[', name.replace(/]/g, ']]'), ']'].join('');
  }

  /**
   * Returns the native SQL Server parameter token.
   */
  public parameter(index: number): string {
    return `@p${index}`;
  }

  /**
   * Applies SQL Server pagination syntax.
   */
  public paginateQuery(
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
    const tokens = keys.map((_, index) => this.parameter(index + 1)).join(', ');
    const values = keys.map((key) => data[key]);

    const statement = `
      INSERT INTO ${quotedTableName} (${columns})
      OUTPUT INSERTED.id
      VALUES (${tokens})
    `;
    const result = await this.execute(statement, values);
    const insertedId = result.rows[0]?.id ?? result.info?.insertId;

    return await this.selectSingle(table, 'WHERE id=@p1', [insertedId]);
  }

  /**
   * @inheritdoc
   */
  public async update(table: string, record: Record): Promise<Record> {
    const id = record.id;
    const data: Record = { ...record };
    delete data.id;
    const quotedTableName = this.quoteIdentifier(table);
    const keys = Object.keys(data);
    const snippets = keys
      .map(
        (column, index) =>
          `${this.quoteIdentifier(column)}=${this.parameter(index + 1)}`,
      )
      .join(', ');
    const statement = `UPDATE ${quotedTableName} SET ${snippets} WHERE id=${this.parameter(keys.length + 1)}`;

    await this.execute(statement, [...Object.values(data), id]);
    return await this.selectSingle(table, 'WHERE id=@p1', [id]);
  }

  /**
   * @inheritdoc
   */
  public async delete(table: string, id: number): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const record = await this.selectSingle(table, 'WHERE id=@p1', [id]);
    await this.execute(`DELETE FROM ${quotedTableName} WHERE id=@p1`, [id]);
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
      `SELECT TOP 1 * FROM ${quotedTableName} ${additional}`,
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
    const request = pool.request();

    args.forEach((value, index) => {
      request.input(`p${index + 1}`, value);
    });

    const sqlResult = await request.query(statement);
    const rows =
      sqlResult.recordset ??
      (Array.isArray(sqlResult.recordsets) ? sqlResult.recordsets[0] : []) ??
      [];

    return {
      info: {
        affectedRows: Array.isArray(sqlResult.rowsAffected)
          ? sqlResult.rowsAffected[0] || 0
          : 0,
        insertId: rows?.[0]?.id,
      },
      fields: [],
      rows,
    };
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
      WHERE TABLE_SCHEMA = SCHEMA_NAME()
        AND TABLE_NAME = @p1
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
        SELECT TABLE_NAME AS table_name, TABLE_TYPE AS table_type
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = SCHEMA_NAME()
        ORDER BY TABLE_TYPE ASC, TABLE_NAME ASC
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
        FROM INFORMATION_SCHEMA.COLUMNS c
        WHERE c.TABLE_SCHEMA = SCHEMA_NAME()
          AND c.TABLE_NAME = @p1
        ORDER BY c.ORDINAL_POSITION ASC
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
      await this.execute(
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
      await this.execute(
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
  }

  /**
   * Generates SQL Server `CREATE TABLE` SQL.
   */
  public createTableSql(table: string, columns: ColumnDescription[]): string {
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
  }

  /**
   * @inheritdoc
   */
  public release(): void {
    if (!this.poolPromise) {
      return;
    }

    void this.poolPromise.then((pool) => pool.close()).catch(() => undefined);
    this.poolPromise = null;
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
    const sqlServerModule = await loadSqlServerModule();
    const pool = new sqlServerModule.ConnectionPool({
      user: this.config.user,
      password: this.config.password,
      server: this.config.host,
      port: this.config.port || 1433,
      database: this.config.database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    return await pool.connect();
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

  return `${isUnique ? 'UNIQUE ' : ''}INDEX [${indexName}] ${method} (${renderedColumns})`;
}

/**
 * Loads the optional SQL Server driver module and normalizes its export shape.
 */
async function loadSqlServerModule(): Promise<any> {
  try {
    const moduleNamespace = await loadOptionalModule('mssql');
    const sqlServerModule = moduleNamespace.default ?? moduleNamespace;

    if (!sqlServerModule?.ConnectionPool) {
      throw new Error(
        formatDeveloperError(
          'The SQL Server driver "mssql" did not expose ConnectionPool as expected.',
          'Reinstall the "mssql" package and make sure the installed version matches the supported API surface.',
        ),
      );
    }

    return sqlServerModule;
  } catch (error) {
    if (isMissingModuleError(error, 'mssql')) {
      throw new Error(
        formatDeveloperError(
          'SQL Server support requires the optional dependency "mssql".',
          'Install it with `npm install mssql` and restart the service.',
        ),
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown SQL Server driver load failure.';

    throw new Error(
      formatDeveloperError(
        'Failed to load the SQL Server driver "mssql".',
        'Check that the "mssql" package is installed correctly and that Node can resolve it from this project.',
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
