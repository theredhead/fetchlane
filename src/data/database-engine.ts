import { ParsedDatabaseUrl } from '../db.conf';
import { Database, Record } from './database';
import { ColumnDescription, TableSchemaDescription } from './database-metadata';

/**
 * Engine-specific SQL behavior and metadata access for a database platform.
 */
export interface DatabaseEngine {
  /** Canonical engine name. */
  readonly name: string;
  /** Supported aliases that may appear in the connection URL. */
  readonly engines: readonly string[];

  /** Opens a database connection for the supplied parsed URL. */
  connectDatabase(config: ParsedDatabaseUrl): Promise<Database>;
  /** Quotes an identifier such as a table or column name for this engine. */
  quoteIdentifier(name: string): string;
  /** Returns the parameter placeholder syntax for the given parameter index. */
  parameter(index: number): string;
  /** Applies engine-specific pagination to a base query. */
  paginateQuery(
    baseQuery: string,
    limit: number,
    offset: number,
    orderByClause: string | null,
  ): string;
  /** Lists user-visible tables for the active connection. */
  getTableNames(db: Database): Promise<Record[]>;
  /** Returns basic column information for a table. */
  getTableInfo(db: Database, table: string): Promise<Record[]>;
  /** Returns normalized schema metadata for a table. */
  describeTable(
    db: Database,
    table: string,
  ): Promise<TableSchemaDescription | null>;
  /** Generates a `CREATE TABLE` statement for the supplied columns. */
  createTableSql(table: string, columns: ColumnDescription[]): string;
}

/** Registry mapping engine aliases to their implementation. */
export type DatabaseEngineRegistry = Map<string, DatabaseEngine>;

/**
 * Builds a lookup map for all configured database engines and their aliases.
 */
export function createDatabaseEngineRegistry(
  engines: readonly DatabaseEngine[],
): DatabaseEngineRegistry {
  const registry: DatabaseEngineRegistry = new Map();

  for (const engine of engines) {
    for (const alias of engine.engines) {
      registry.set(alias, engine);
    }
  }

  return registry;
}
