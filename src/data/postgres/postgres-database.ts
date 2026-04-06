import { createRequire } from 'node:module';
import { ParsedDatabaseUrl } from '../../db.conf';
import { formatDeveloperError } from '../../errors/api-error';
import {
  DatabaseAdapter,
  PrimaryKeyColumn,
  PrimaryKeyValue,
  Record,
  RecordSet,
  SupportsSchemaDescription,
  SupportsTableInfo,
  SupportsTableListing,
} from '../database';
import { TableSchemaDescription } from '../database-metadata';

/**
 * PostgreSQL adapter implementation.
 */
export class PostgresDatabase
  implements
    DatabaseAdapter,
    SupportsTableListing,
    SupportsTableInfo,
    SupportsSchemaDescription
{
  /**
   * Canonical adapter name used for registration and logging.
   */
  public static readonly adapterName = 'postgres';
  /**
   * Connection URL engine aliases matched by this adapter.
   */
  public static readonly engines = ['postgres', 'postgresql'] as const;

  /**
   * Runtime adapter name exposed to callers.
   */
  public readonly name = PostgresDatabase.adapterName;

  private poolPromise: Promise<any> | null = null;

  /**
   * Creates a pooled PostgreSQL adapter.
   */
  public constructor(private readonly config: ParsedDatabaseUrl) {}

  /**
   * Quotes an identifier using PostgreSQL rules.
   */
  public quoteIdentifier(name: string): string {
    return ['"', name.replace(/"/g, '""'), '"'].join('');
  }

  /**
   * Returns the native PostgreSQL parameter token.
   */
  public parameter(index: number): string {
    return `$${index}`;
  }

  /**
   * Applies PostgreSQL pagination syntax.
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
    const keys = Object.keys(record);
    const columns = keys.map((key) => this.quoteIdentifier(key)).join(', ');
    const tokens = keys.map((_, index) => this.parameter(index + 1)).join(', ');
    const values = keys.map((key) => record[key]);

    const statement = `INSERT INTO ${quotedTableName} (${columns}) VALUES (${tokens}) RETURNING *`;
    const result = await this.execute(statement, values);
    return result.rows[0];
  }

  /**
   * @inheritdoc
   */
  public async update(
    table: string,
    primaryKey: PrimaryKeyValue,
    record: Record,
  ): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const dataKeys = Object.keys(record);
    const setSnippets = dataKeys
      .map(
        (column, index) =>
          `${this.quoteIdentifier(column)}=${this.parameter(index + 1)}`,
      )
      .join(', ');

    const pkEntries = Object.entries(primaryKey);
    const whereSnippets = pkEntries
      .map(
        ([column], index) =>
          `${this.quoteIdentifier(column)}=${this.parameter(dataKeys.length + index + 1)}`,
      )
      .join(' AND ');

    const statement = `UPDATE ${quotedTableName} SET ${setSnippets} WHERE ${whereSnippets} RETURNING *`;
    const values = [
      ...dataKeys.map((key) => record[key]),
      ...pkEntries.map(([, value]) => value),
    ];

    const result = await this.execute(statement, values);
    return result.rows[0];
  }

  /**
   * @inheritdoc
   */
  public async delete(
    table: string,
    primaryKey: PrimaryKeyValue,
  ): Promise<Record> {
    const quotedTableName = this.quoteIdentifier(table);
    const pkEntries = Object.entries(primaryKey);
    const whereSnippets = pkEntries
      .map(
        ([column], index) =>
          `${this.quoteIdentifier(column)}=${this.parameter(index + 1)}`,
      )
      .join(' AND ');

    const statement = `DELETE FROM ${quotedTableName} WHERE ${whereSnippets} RETURNING *`;
    const values = pkEntries.map(([, value]) => value);

    const result = await this.execute(statement, values);
    return result.rows[0];
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
    const client = await pool.connect();

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
      SELECT COUNT(*)::int AS count
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = $1
      `,
      [tableName],
    );
    return Number(count) === 1;
  }

  /**
   * @inheritdoc
   */
  public async getPrimaryKeyColumns(
    table: string,
  ): Promise<PrimaryKeyColumn[]> {
    const rows = (
      await this.execute(
        `
        SELECT
          kcu.column_name,
          c.data_type,
          CASE
            WHEN c.is_identity = 'YES' THEN true
            WHEN c.column_default LIKE 'nextval(%' THEN true
            ELSE false
          END AS is_generated
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        JOIN information_schema.columns c
          ON c.table_schema = kcu.table_schema
         AND c.table_name = kcu.table_name
         AND c.column_name = kcu.column_name
        WHERE tc.table_schema = 'public'
          AND tc.table_name = $1
          AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position ASC
        `,
        [table],
      )
    ).rows;

    return rows.map((row) => ({
      column: String(row.column_name),
      dataType: String(row.data_type),
      isGenerated: !!row.is_generated,
    }));
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
        WHERE table_schema = 'public'
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
        SELECT
          c.ordinal_position,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
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
      WHERE t.table_schema = 'public'
        AND t.table_name = $1
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
      await this.execute(
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
      await this.execute(
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

  private isCommandResult(result: {
    command: string;
    rowCount?: number | null;
  }): boolean {
    return result.command !== 'SELECT' && result.rowCount != null;
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
    const pgModule = await loadPostgresModule();
    return new pgModule.Pool({
      user: this.config.user,
      password: this.config.password,
      host: this.config.host,
      port: this.config.port || 5432,
      database: this.config.database,
    });
  }
}

/**
 * Loads the optional PostgreSQL driver module and normalizes its export shape.
 */
async function loadPostgresModule(): Promise<any> {
  try {
    const moduleNamespace = await loadOptionalModule('pg');
    const pgModule = moduleNamespace.default ?? moduleNamespace;

    if (!pgModule?.Pool) {
      throw new Error(
        formatDeveloperError(
          'The PostgreSQL driver "pg" did not expose Pool as expected.',
          'Reinstall the "pg" package and make sure the installed version matches the supported API surface.',
        ),
      );
    }

    return pgModule;
  } catch (error) {
    if (isMissingModuleError(error, 'pg')) {
      throw new Error(
        formatDeveloperError(
          'PostgreSQL support requires the optional dependency "pg".',
          'Install it with `npm install pg` and restart the service.',
        ),
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : 'Unknown PostgreSQL driver load failure.';

    throw new Error(
      formatDeveloperError(
        'Failed to load the PostgreSQL driver "pg".',
        'Check that the "pg" package is installed correctly and that Node can resolve it from this project.',
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
