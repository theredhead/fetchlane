/**
 * Minimal column definition used when generating a `CREATE TABLE` statement.
 */
export interface ColumnDescription {
  /** Column name. */
  name: string;
  /** Database-specific column type declaration. */
  type: string;
  /** Whether the column accepts `NULL`. */
  nullable: boolean;
}

/**
 * Normalized metadata for a single table column.
 */
export interface TableSchemaColumn {
  ordinal_position: number;
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  column_default: string | null;
  is_identity: boolean;
  identity_generation: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
}

/**
 * Normalized metadata for a table constraint.
 */
export interface TableSchemaConstraint {
  constraint_name: string;
  constraint_type: string;
  columns: string[];
  referenced_table_schema: string | null;
  referenced_table: string | null;
  referenced_columns: string[];
  update_rule: string | null;
  delete_rule: string | null;
}

/**
 * Normalized metadata for a table index.
 */
export interface TableSchemaIndex {
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  method: string;
  predicate: string | null;
  columns: string[];
  definition: string;
}

/**
 * Complete normalized schema description for a table.
 */
export interface TableSchemaDescription {
  table_name: string;
  table_schema: string;
  table_type: string;
  columns: TableSchemaColumn[];
  constraints: TableSchemaConstraint[];
  indexes: TableSchemaIndex[];
}
