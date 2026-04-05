import { Inject, Injectable } from '@nestjs/common';
import {
  DatabaseAdapter,
  PrimaryKeyColumn,
  PrimaryKeyValue,
  Record,
  supportsSchemaDescription,
  supportsTableInfo,
  supportsTableListing,
} from '../data/database';
import { TableSchemaDescription } from '../data/database-metadata';
import { DATABASE_CONNECTION } from '../data/database.providers';
import { badRequest, notFound, notImplemented } from '../errors/api-error';
import { RuntimeConfigService } from '../config/runtime-config';

/**
 * Fallback page size used when the service is called without an explicit
 * page size (e.g. direct service calls outside the HTTP controller path).
 */
const DEFAULT_PAGE_SIZE = 100;

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
    private readonly runtimeConfig: RuntimeConfigService,
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
   * Returns the primary key columns for a table, using database metadata
   * or a config override when available.
   */
  public async getPrimaryKeyColumns(
    table: string,
  ): Promise<PrimaryKeyColumn[]> {
    const configOverride = this.runtimeConfig.getPrimaryKeyOverride(table);
    if (configOverride) {
      return configOverride;
    }

    return await this.adapter.getPrimaryKeyColumns(table);
  }

  /**
   * Returns a paginated list of rows from a table.
   */
  public async index(
    table: string,
    pageIndex = 0,
    pageSize?: number,
  ): Promise<Record[]> {
    if (pageSize === undefined) {
      pageSize = Math.max(
        DEFAULT_PAGE_SIZE,
        this.runtimeConfig.getLimits().fetchMaxPageSize,
      );
    }
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
   * Looks up a single row by primary key.
   */
  public async selectSingleByPrimaryKey(
    table: string,
    primaryKey: PrimaryKeyValue,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const { whereClause, values } = this.buildWhereClause(primaryKey);
    const record = await this.adapter.selectSingle(
      table,
      `WHERE ${whereClause}`,
      values,
    );

    return this.ensureRecordExists(table, primaryKey, record);
  }

  /**
   * Inserts a row into a table.
   *
   * Rejects the request before touching the database when the record
   * contains values for auto-generated primary key columns.
   */
  public async insert(table: string, record: Record): Promise<Record> {
    await this.ensureTableExists(table);
    await this.rejectGeneratedPrimaryKeyValues(table, record);
    return await this.adapter.insert(table, record);
  }

  /**
   * Replaces a row in a table by primary key.
   *
   * Auto-generated primary key columns are silently excluded from the
   * update payload because database engines reject SET on identity /
   * serial / auto-increment columns.
   */
  public async update(
    table: string,
    primaryKey: PrimaryKeyValue,
    record: Record,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const sanitizedRecord = await this.stripGeneratedPrimaryKeyColumns(
      table,
      record,
    );
    const updated = await this.adapter.update(
      table,
      primaryKey,
      sanitizedRecord,
    );
    return this.ensureRecordExists(table, primaryKey, updated);
  }

  /**
   * Deletes a row from a table by primary key.
   */
  public async delete(
    table: string,
    primaryKey: PrimaryKeyValue,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const deleted = await this.adapter.delete(table, primaryKey);
    return this.ensureRecordExists(table, primaryKey, deleted);
  }

  /**
   * Returns a single column value from a row identified by primary key.
   */
  public async getColumnFromRecord(
    table: string,
    primaryKey: PrimaryKeyValue,
    column: string,
  ): Promise<string | null> {
    await this.ensureTableExists(table);

    const { whereClause, values } = this.buildWhereClause(primaryKey);
    const record = await this.adapter.selectSingle(
      table,
      `WHERE ${whereClause}`,
      values,
    );
    const existingRecord = this.ensureRecordExists(table, primaryKey, record);

    if (!Object.prototype.hasOwnProperty.call(existingRecord, column)) {
      throw badRequest(
        `Column "${column}" does not exist on table "${table}".`,
        `Use ${table}/info to inspect valid column names before requesting a single column value.`,
      );
    }

    return (existingRecord[column] as string | null) ?? null;
  }

  /**
   * Updates a single column on a row identified by primary key.
   */
  public async updateColumnForRecord(
    table: string,
    primaryKey: PrimaryKeyValue,
    column: string,
    value: unknown,
  ): Promise<Record> {
    await this.ensureTableExists(table);

    const record = { [column]: value };
    const updated = await this.adapter.update(table, primaryKey, record);
    return this.ensureRecordExists(table, primaryKey, updated);
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
    primaryKey: PrimaryKeyValue,
    record: Record | undefined,
  ): Record {
    if (record) {
      return record;
    }

    const keyDescription = Object.entries(primaryKey)
      .map(([column, value]) => `${column}=${JSON.stringify(value)}`)
      .join(', ');

    throw notFound(
      `Record (${keyDescription}) was not found in table "${table}".`,
      'Verify the primary key values, or query the table first to inspect which records are available.',
    );
  }

  private buildWhereClause(primaryKey: PrimaryKeyValue): {
    whereClause: string;
    values: unknown[];
  } {
    const entries = Object.entries(primaryKey);
    const whereClause = entries
      .map(
        ([column], index) =>
          `${this.adapter.quoteIdentifier(column)}=${this.adapter.parameter(index + 1)}`,
      )
      .join(' AND ');
    const values = entries.map(([, value]) => value);

    return { whereClause, values };
  }

  private async rejectGeneratedPrimaryKeyValues(
    table: string,
    record: Record,
  ): Promise<void> {
    const primaryKeyColumns = await this.getPrimaryKeyColumns(table);
    const generatedColumns = primaryKeyColumns
      .filter((column) => column.isGenerated)
      .filter((column) => column.column in record);

    if (generatedColumns.length > 0) {
      const names = generatedColumns.map((column) => column.column).join(', ');
      throw badRequest(
        `Cannot insert explicit values for auto-generated primary key columns: ${names}.`,
        'Remove auto-generated primary key columns from the request body — the database assigns these values automatically.',
      );
    }
  }

  private async stripGeneratedPrimaryKeyColumns(
    table: string,
    record: Record,
  ): Promise<Record> {
    const primaryKeyColumns = await this.getPrimaryKeyColumns(table);
    const generatedColumnNames = new Set(
      primaryKeyColumns
        .filter((column) => column.isGenerated)
        .map((column) => column.column),
    );

    if (generatedColumnNames.size === 0) {
      return record;
    }

    const filtered: Record = {};
    for (const [key, value] of Object.entries(record)) {
      if (!generatedColumnNames.has(key)) {
        filtered[key] = value;
      }
    }
    return filtered;
  }
}

export type { TableSchemaDescription } from '../data/database-metadata';
