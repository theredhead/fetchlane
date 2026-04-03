/**
 * Minimal column definition used when generating a `CREATE TABLE` statement.
 */
export interface ColumnDescription {
  /**
   * Column name.
   */
  name: string;
  /**
   * Database-specific column type declaration.
   */
  type: string;
  /**
   * Whether the column accepts `NULL`.
   */
  nullable: boolean;
}

/**
 * Normalized metadata for a single table column.
 */
export interface TableSchemaColumn {
  /**
   * One-based ordinal position within the table.
   */
  ordinal_position: number;
  /**
   * Column name.
   */
  column_name: string;
  /**
   * Canonical data type name (e.g. "integer", "character varying").
   */
  data_type: string;
  /**
   * Engine-specific underlying type name.
   */
  udt_name: string;
  /**
   * Whether the column accepts `NULL` values.
   */
  is_nullable: boolean;
  /**
   * Default expression for the column, or `null` when none is set.
   */
  column_default: string | null;
  /**
   * Whether the column is an identity column.
   */
  is_identity: boolean;
  /**
   * Identity generation strategy (e.g. "ALWAYS", "BY DEFAULT"), or `null`.
   */
  identity_generation: string | null;
  /**
   * Maximum character length for string types, or `null` for non-string types.
   */
  character_maximum_length: number | null;
  /**
   * Numeric precision for numeric types, or `null` when not applicable.
   */
  numeric_precision: number | null;
  /**
   * Numeric scale for numeric types, or `null` when not applicable.
   */
  numeric_scale: number | null;
}

/**
 * Normalized metadata for a table constraint.
 */
export interface TableSchemaConstraint {
  /**
   * Constraint name as defined in the database.
   */
  constraint_name: string;
  /**
   * Constraint type (e.g. "PRIMARY KEY", "FOREIGN KEY", "UNIQUE").
   */
  constraint_type: string;
  /**
   * Column names participating in the constraint.
   */
  columns: string[];
  /**
   * Schema of the referenced table for foreign keys, or `null`.
   */
  referenced_table_schema: string | null;
  /**
   * Referenced table name for foreign keys, or `null`.
   */
  referenced_table: string | null;
  /**
   * Referenced column names for foreign keys.
   */
  referenced_columns: string[];
  /**
   * Referential update rule for foreign keys, or `null`.
   */
  update_rule: string | null;
  /**
   * Referential delete rule for foreign keys, or `null`.
   */
  delete_rule: string | null;
}

/**
 * Normalized metadata for a table index.
 */
export interface TableSchemaIndex {
  /**
   * Index name as defined in the database.
   */
  index_name: string;
  /**
   * Whether the index enforces uniqueness.
   */
  is_unique: boolean;
  /**
   * Whether the index backs the primary key.
   */
  is_primary: boolean;
  /**
   * Index access method (e.g. "btree", "hash").
   */
  method: string;
  /**
   * Partial index predicate expression, or `null` for full indexes.
   */
  predicate: string | null;
  /**
   * Column names included in the index.
   */
  columns: string[];
  /**
   * Full engine-specific index definition statement.
   */
  definition: string;
}

/**
 * Complete normalized schema description for a table.
 */
export interface TableSchemaDescription {
  /**
   * Table name.
   */
  table_name: string;
  /**
   * Schema the table belongs to.
   */
  table_schema: string;
  /**
   * Table type (e.g. "BASE TABLE", "VIEW").
   */
  table_type: string;
  /**
   * Column metadata for the table.
   */
  columns: TableSchemaColumn[];
  /**
   * Constraints defined on the table.
   */
  constraints: TableSchemaConstraint[];
  /**
   * Indexes defined on the table.
   */
  indexes: TableSchemaIndex[];
}
