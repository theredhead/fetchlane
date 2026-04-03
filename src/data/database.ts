import { ParsedDatabaseUrl } from '../db.conf';
import { ColumnDescription, TableSchemaDescription } from './database-metadata';

/**
 * Generic row-shaped record returned by the data-access layer.
 */
export type Record = { id?: number; [column: string]: any };

/**
 * Result of executing a SQL statement through a database adapter.
 */
export interface RecordSet {
  /**
   * Driver-specific metadata such as affected row counts.
   */
  info?: any;
  /**
   * Driver-specific field metadata when available.
   */
  fields?: any[];
  /**
   * Rows returned by the statement.
   */
  rows: Record[];
}

/**
 * Shared runtime contract implemented by every database adapter.
 */
export interface DatabaseAdapter {
  /**
   * Canonical engine name.
   */
  readonly name: string;

  /**
   * Quotes an identifier such as a table or column name.
   */
  quoteIdentifier(name: string): string;

  /**
   * Returns the native parameter token for the given 1-based position.
   */
  parameter(index: number): string;

  /**
   * Applies engine-specific pagination to a base query.
   */
  paginateQuery(
    baseQuery: string,
    limit: number,
    offset: number,
    orderByClause: string | null,
  ): string;

  /**
   * Inserts a record into a table and returns the stored row.
   */
  insert(table: string, record: Record): Promise<Record>;

  /**
   * Updates a record in a table and returns the stored row.
   */
  update(table: string, record: Record): Promise<Record>;

  /**
   * Deletes a record from a table and returns the deleted row.
   */
  delete(table: string, id: number): Promise<Record>;

  /**
   * Selects rows from a table with an optional SQL suffix and bound arguments.
   */
  select(table: string, where?: string, args?: any[]): Promise<RecordSet>;

  /**
   * Selects a single row from a table.
   */
  selectSingle(table: string, where: string, args: any[]): Promise<Record>;

  /**
   * Executes a SQL statement and returns the full result set.
   */
  execute(statement: string, args?: any[]): Promise<RecordSet>;

  /**
   * Executes a SQL statement and returns the first row.
   */
  executeSingle<T>(statement: string, args?: any[]): Promise<T>;

  /**
   * Executes a SQL statement and returns the first column of the first row.
   */
  executeScalar<T>(statement: string, args?: any[]): Promise<T>;

  /**
   * Determines whether a table exists in the current database.
   */
  tableExists(tableName: string): Promise<boolean>;

  /**
   * Releases any pooled or open database resources.
   */
  release(): void | Promise<void>;
}

/**
 * Adapter capability for listing visible tables.
 */
export interface SupportsTableListing {
  getTableNames(): Promise<Record[]>;
}

/**
 * Adapter capability for returning basic column metadata.
 */
export interface SupportsTableInfo {
  getTableInfo(table: string): Promise<Record[]>;
}

/**
 * Adapter capability for returning normalized schema metadata.
 */
export interface SupportsSchemaDescription {
  describeTable(table: string): Promise<TableSchemaDescription | null>;
}

/**
 * Adapter capability for generating engine-specific `CREATE TABLE` SQL.
 */
export interface SupportsCreateTableSql {
  createTableSql(table: string, columns: ColumnDescription[]): string;
}

/**
 * Constructor contract for a database adapter class.
 */
export interface DatabaseAdapterConstructor {
  readonly adapterName: string;
  readonly engines: readonly string[];
  new (config: ParsedDatabaseUrl): DatabaseAdapter;
}

/**
 * Registry mapping connection URL aliases to adapter constructors.
 */
export type DatabaseAdapterRegistry = Map<string, DatabaseAdapterConstructor>;

/**
 * Builds a lookup map for all configured database adapter classes and aliases.
 */
export function createDatabaseAdapterRegistry(
  adapters: readonly DatabaseAdapterConstructor[],
): DatabaseAdapterRegistry {
  const registry: DatabaseAdapterRegistry = new Map();

  for (const adapter of adapters) {
    for (const alias of adapter.engines) {
      registry.set(alias, adapter);
    }
  }

  return registry;
}

/**
 * Checks whether an adapter can list user-visible tables.
 */
export function supportsTableListing(
  adapter: DatabaseAdapter,
): adapter is DatabaseAdapter & SupportsTableListing {
  return (
    typeof (adapter as Partial<SupportsTableListing>).getTableNames ===
    'function'
  );
}

/**
 * Checks whether an adapter can provide column metadata.
 */
export function supportsTableInfo(
  adapter: DatabaseAdapter,
): adapter is DatabaseAdapter & SupportsTableInfo {
  return (
    typeof (adapter as Partial<SupportsTableInfo>).getTableInfo === 'function'
  );
}

/**
 * Checks whether an adapter can provide normalized schema metadata.
 */
export function supportsSchemaDescription(
  adapter: DatabaseAdapter,
): adapter is DatabaseAdapter & SupportsSchemaDescription {
  return (
    typeof (adapter as Partial<SupportsSchemaDescription>).describeTable ===
    'function'
  );
}

/**
 * Checks whether an adapter can generate `CREATE TABLE` SQL.
 */
export function supportsCreateTableSql(
  adapter: DatabaseAdapter,
): adapter is DatabaseAdapter & SupportsCreateTableSql {
  return (
    typeof (adapter as Partial<SupportsCreateTableSql>).createTableSql ===
    'function'
  );
}
