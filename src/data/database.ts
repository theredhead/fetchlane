/**
 * Generic row-shaped record returned by the data-access layer.
 */
export type Record = { id?: number; [column: string]: any };

/**
 * Result of executing a SQL statement through a database adapter.
 */
export interface RecordSet {
  /** Driver-specific metadata such as affected row counts. */
  info?: any;
  /** Driver-specific field metadata when available. */
  fields?: any[];
  /** Rows returned by the statement. */
  rows: Record[];
}

/**
 * Defines the common CRUD and execution operations supported by database adapters.
 */
export interface Database {
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
  select(table: string, where: string, args: any[]): Promise<RecordSet>;

  /**
   * Selects a single row from a table.
   */
  selectSingle(table: string, where: string, args: any[]): Promise<Record>;

  /**
   * Executes a SQL statement and returns the full result set.
   */
  execute(statement: string, args: any[]): Promise<RecordSet>;

  /**
   * Executes a SQL statement and returns the first row.
   */
  executeSingle<T>(statement: string, args: any[]): Promise<T>;

  /**
   * Executes a SQL statement and returns the first column of the first row.
   */
  executeScalar<T>(statement: string, args: any[]): Promise<T>;

  /**
   * Determines whether a table exists in the current database.
   */
  tableExists(tableName: string): Promise<boolean>;

  /**
   * Releases any pooled or open database resources.
   */
  release(): void;
}
