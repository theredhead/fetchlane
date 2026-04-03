import { Inject, Injectable } from '@nestjs/common';
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
import { badRequest, notFound, notImplemented } from '../errors/api-error';

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

  /**
   * Lists the tables exposed by the active adapter.
   */
  public async getTableNames(): Promise<Record[]> {
    if (!supportsTableListing(this.adapter)) {
      throw notImplemented(
        `The active "${this.adapter.name}" adapter does not support listing tables.`,
        'Use a database engine that supports table discovery, or avoid the table-names endpoint for this engine.',
      );
    }

    return await this.adapter.getTableNames();
  }

  /**
   * Returns basic column metadata for a table.
   */
  public async tableInfo(table: string): Promise<Record[]> {
    await this.ensureTableExists(table);

    if (!supportsTableInfo(this.adapter)) {
      throw notImplemented(
        `The active "${this.adapter.name}" adapter does not support table metadata.`,
        'Use an engine that supports schema inspection, or call this endpoint only for adapters with metadata capabilities.',
      );
    }

    return await this.adapter.getTableInfo(table);
  }

  /**
   * Returns normalized schema metadata for a table.
   */
  public async describeTable(
    table: string,
  ): Promise<TableSchemaDescription | null> {
    await this.ensureTableExists(table);

    if (!supportsSchemaDescription(this.adapter)) {
      throw notImplemented(
        `The active "${this.adapter.name}" adapter does not support schema descriptions.`,
        'Use an engine that implements schema description support, or avoid this endpoint for the current engine.',
      );
    }

    return await this.adapter.describeTable(table);
  }

  /**
   * Returns a paginated list of rows from a table.
   */
  public async index(
    table: string,
    pageIndex = 0,
    pageSize = 1000,
  ): Promise<Record[]> {
    await this.ensureTableExists(table);

    const offset = pageIndex * pageSize;
    const baseQuery = `SELECT * FROM ${this.adapter.quoteIdentifier(table)}`;
    const data = await this.adapter.execute(
      this.adapter.paginateQuery(baseQuery, pageSize, offset, null),
      [],
    );
    return data.rows;
  }

  /**
   * Looks up a single row by numeric `id`.
   */
  public async selectSingleById(table: string, id: number): Promise<Record> {
    await this.ensureTableExists(table);

    const record = await this.adapter.selectSingle(
      table,
      `WHERE id=${this.adapter.parameter(1)}`,
      [id],
    );

    return this.ensureRecordExists(table, id, record);
  }

  /**
   * Inserts a row into a table.
   */
  public async insert(table: string, record: Record): Promise<Record> {
    await this.ensureTableExists(table);
    return await this.adapter.insert(table, record);
  }

  /**
   * Replaces a row in a table by numeric `id`.
   */
  public async update(
    table: string,
    id: number,
    record: Record,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const updated = await this.adapter.update(table, { ...record, id });
    return this.ensureRecordExists(table, id, updated);
  }

  /**
   * Deletes a row from a table by numeric `id`.
   */
  public async delete(table: string, id: number): Promise<Record> {
    await this.ensureTableExists(table);

    const deleted = await this.adapter.delete(table, id);
    return this.ensureRecordExists(table, id, deleted);
  }

  /**
   * Returns a single column value from a row identified by numeric `id`.
   */
  public async getColumnFromRecordbyId(
    table: string,
    id: number,
    column: string,
  ): Promise<string | null> {
    await this.ensureTableExists(table);

    const record = await this.adapter.selectSingle(
      table,
      `WHERE id=${this.adapter.parameter(1)}`,
      [id],
    );
    const existingRecord = this.ensureRecordExists(table, id, record);

    if (!Object.prototype.hasOwnProperty.call(existingRecord, column)) {
      throw badRequest(
        `Column "${column}" does not exist on table "${table}".`,
        `Use ${table}/info to inspect valid column names before requesting a single column value.`,
      );
    }

    return (existingRecord[column] as string | null) ?? null;
  }

  /**
   * Updates a single column on a row identified by numeric `id`.
   */
  public async updateColumnForRecordById(
    table: string,
    id: number,
    column: string,
    value: unknown,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const record = { [column]: value };
    const updated = await this.adapter.update(table, { ...record, id });
    return this.ensureRecordExists(table, id, updated);
  }

  /**
   * Generates engine-specific `CREATE TABLE` SQL for a proposed schema.
   */
  public async createTable(
    table: string,
    columns: ColumnDescription[],
  ): Promise<string> {
    if (!supportsCreateTableSql(this.adapter)) {
      throw notImplemented(
        `The active "${this.adapter.name}" adapter does not support CREATE TABLE SQL generation.`,
        'Use an engine that implements CREATE TABLE SQL generation, or skip this endpoint for the current adapter.',
      );
    }

    return this.adapter.createTableSql(table, columns);
  }

  /**
   * Executes raw SQL against the active adapter.
   */
  public async execute(text: string, args: any[]) {
    if (!Array.isArray(args)) {
      throw badRequest(
        'Raw SQL execution args must be an array.',
        'Pass positional query arguments as an array, even when it is empty.',
      );
    }

    return await this.adapter.execute(text, args);
  }

  private async ensureTableExists(table: string): Promise<void> {
    const exists = await this.adapter.tableExists(table);

    if (!exists) {
      throw notFound(
        `Table "${table}" was not found in the active database.`,
        'Verify the table name and schema, or call the table-names endpoint to inspect available tables.',
      );
    }
  }

  private ensureRecordExists(
    table: string,
    id: number,
    record: Record | undefined,
  ): Record {
    if (record) {
      return record;
    }

    throw notFound(
      `Record "${id}" was not found in table "${table}".`,
      'Verify the record id, or query the table first to inspect which records are available.',
    );
  }
}

export type {
  ColumnDescription,
  TableSchemaDescription,
} from '../data/database-metadata';
