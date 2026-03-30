import { Database, Record, RecordSet } from './../database';
import { Pool, PoolConfig, QueryResult } from 'pg';

export class PostgresDatabase implements Database {
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

  release(): void {
    this.pool.end();
  }
}
