import { ParsedDatabaseUrl } from '../db.conf';
import { Database, Record } from './database';
import { ColumnDescription, TableSchemaDescription } from './database-metadata';

export interface DatabaseEngine {
  readonly name: string;
  readonly engines: readonly string[];

  createDatabase(config: ParsedDatabaseUrl): Promise<Database>;
  quoteIdentifier(name: string): string;
  parameter(index: number): string;
  getTableNames(db: Database): Promise<Record[]>;
  getTableInfo(db: Database, table: string): Promise<Record[]>;
  describeTable(
    db: Database,
    table: string,
  ): Promise<TableSchemaDescription | null>;
  createTableSql(table: string, columns: ColumnDescription[]): string;
}

export type DatabaseEngineRegistry = Map<string, DatabaseEngine>;

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
