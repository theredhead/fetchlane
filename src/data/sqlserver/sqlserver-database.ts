import { createRequire } from 'node:module';
import { Database, Record, RecordSet } from '../database';

/**
 * SQL Server implementation of the generic database contract.
 */
export class SqlServerDatabase implements Database {
  private poolPromise: Promise<any> | null = null;

  /**
   * Creates a pooled SQL Server connection wrapper.
   */
  public constructor(private readonly config: any) {}

  /** Quotes a table or column name using SQL Server identifier rules. */
  public quoteObjectName = (name: string): string => ['[', name, ']'].join('');

  /** @inheritdoc */
  public async insert(table: string, record: Record): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const data: any = { ...record };
    delete data.id;
    const keys = Object.keys(data);
    const columns = keys.map(this.quoteObjectName).join(', ');
    const tokens = keys.map((_, index) => `@p${index + 1}`).join(', ');
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

  /** @inheritdoc */
  public async update(table: string, record: Record): Promise<Record> {
    const id = record.id;
    const data: any = { ...record };
    delete data.id;
    const quotedTableName = this.quoteObjectName(table);
    const keys = Object.keys(data);
    const snippets = keys
      .map((col, index) => `${this.quoteObjectName(col)}=@p${index + 1}`)
      .join(', ');
    const statement = `UPDATE ${quotedTableName} SET ${snippets} WHERE id=@p${keys.length + 1}`;

    await this.execute(statement, [...Object.values(data), id]);
    return await this.selectSingle(table, 'WHERE id=@p1', [id]);
  }

  /** @inheritdoc */
  public async delete(table: string, id: number): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const record = await this.selectSingle(table, 'WHERE id=@p1', [id]);
    await this.execute(`DELETE FROM ${quotedTableName} WHERE id=@p1`, [id]);
    return record;
  }

  /** @inheritdoc */
  public async select(
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

  /** @inheritdoc */
  public async selectSingle(
    table: string,
    additional: string,
    args: any[],
  ): Promise<Record> {
    const quotedTableName = this.quoteObjectName(table);
    const result = await this.execute(
      `SELECT TOP 1 * FROM ${quotedTableName} ${additional}`,
      args,
    );
    return result.rows.shift();
  }

  /** @inheritdoc */
  public async execute(statement: string, args: any[] = []): Promise<RecordSet> {
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

  /** @inheritdoc */
  public async executeSingle<T>(
    statement: string,
    args: any[] = [],
  ): Promise<T> {
    const result = (await this.execute(statement, args)).rows;
    return result.shift() as T;
  }

  /** @inheritdoc */
  public async executeScalar<T>(
    statement: string,
    args: any[] = [],
  ): Promise<T> {
    const result = await this.executeSingle<Record>(statement, args);
    const key = Object.keys(result).shift();
    return result[key as keyof Record] as T;
  }

  /** @inheritdoc */
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

  /** @inheritdoc */
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
      port: this.config.port,
      database: this.config.database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
      },
    });

    return await pool.connect();
  }
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
        'The "mssql" package loaded successfully, but it did not expose ConnectionPool as expected.',
      );
    }

    return sqlServerModule;
  } catch (error) {
    if (isMissingModuleError(error, 'mssql')) {
      throw new Error(
        'SQL Server support requires the optional dependency "mssql". Install it with `npm install mssql`.',
      );
    }

    const message =
      error instanceof Error ? error.message : 'Unknown SQL Server driver load failure.';

    throw new Error(
      `Failed to load the SQL Server driver "mssql": ${message}`,
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
