import {
  Inject,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import {
  DatabaseAdapter,
  Record,
  supportsCreateTableSql,
  supportsSchemaDescription,
  supportsTableInfo,
  supportsTableListing,
} from 'src/data/database';
import {
  ColumnDescription,
  TableSchemaDescription,
} from '../data/database-metadata';
import { DATABASE_CONNECTION } from '../data/database.providers';

@Injectable()
/**
 * High-level facade over the active database adapter.
 */
export class DataAccessService {
  /**
   * Creates the high-level data-access facade for the active adapter.
   */
  public constructor(
    @Inject(DATABASE_CONNECTION) private readonly adapter: DatabaseAdapter,
  ) {}

  /** Lists the tables exposed by the active adapter. */
  public async getTableNames(): Promise<Record[]> {
    if (!supportsTableListing(this.adapter)) {
      throw new NotImplementedException(
        `The active "${this.adapter.name}" adapter does not support listing tables.`,
      );
    }

    return await this.adapter.getTableNames();
  }

  /** Returns basic column metadata for a table. */
  public async tableInfo(table: string): Promise<Record[]> {
    if (!supportsTableInfo(this.adapter)) {
      throw new NotImplementedException(
        `The active "${this.adapter.name}" adapter does not support table metadata.`,
      );
    }

    return await this.adapter.getTableInfo(table);
  }

  /** Returns normalized schema metadata for a table. */
  public async describeTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    if (!supportsSchemaDescription(this.adapter)) {
      throw new NotImplementedException(
        `The active "${this.adapter.name}" adapter does not support schema descriptions.`,
      );
    }

    return await this.adapter.describeTable(table);
  }

  /** Returns a paginated list of rows from a table. */
  public async index(
    table: string,
    pageIndex = 0,
    pageSize = 1000,
  ): Promise<Record[]> {
    const offset = pageIndex * pageSize;
    const baseQuery = `SELECT * FROM ${this.adapter.quoteIdentifier(table)}`;
    const data = await this.adapter.execute(
      this.adapter.paginateQuery(baseQuery, pageSize, offset, null),
      [],
    );
    return data.rows;
  }

  /** Looks up a single row by numeric `id`. */
  public async selectSingleById(table: string, id: number): Promise<Record> {
    return await this.adapter.selectSingle(
      table,
      `WHERE id=${this.adapter.parameter(1)}`,
      [id],
    );
  }

  /** Inserts a row into a table. */
  public async insert(table: string, record: Record): Promise<Record> {
    return await this.adapter.insert(table, record);
  }

  /** Replaces a row in a table by numeric `id`. */
  public async update(
    table: string,
    id: number,
    record: Record,
  ): Promise<Record> {
    return await this.adapter.update(table, { ...record, id });
  }

  /** Deletes a row from a table by numeric `id`. */
  public async delete(table: string, id: number): Promise<Record> {
    return await this.adapter.delete(table, id);
  }

  /** Returns a single column value from a row identified by numeric `id`. */
  public async getColumnFromRecordbyId(
    table: string,
    id: number,
    column: string,
  ): Promise<string | null> {
    const record = await this.adapter.selectSingle(
      table,
      `WHERE id=${this.adapter.parameter(1)}`,
      [id],
    );
    return (record?.[column] as string | null) ?? null;
  }

  /** Updates a single column on a row identified by numeric `id`. */
  public async updateColumnForRecordById(
    table: string,
    id: number,
    column: string,
    value: unknown,
  ): Promise<Record> {
    const record = { [column]: value };
    return await this.adapter.update(table, { ...record, id });
  }

  /** Generates engine-specific `CREATE TABLE` SQL for a proposed schema. */
  public async createTable(
    table: string,
    columns: ColumnDescription[],
  ): Promise<string> {
    if (!supportsCreateTableSql(this.adapter)) {
      throw new NotImplementedException(
        `The active "${this.adapter.name}" adapter does not support CREATE TABLE SQL generation.`,
      );
    }

    return this.adapter.createTableSql(table, columns);
  }

  /** Executes raw SQL against the active adapter. */
  public async execute(text: string, args: any[]) {
    return await this.adapter.execute(text, args);
  }
}

export type { ColumnDescription, TableSchemaDescription } from '../data/database-metadata';
