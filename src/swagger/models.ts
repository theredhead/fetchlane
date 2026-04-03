import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Swagger DTO for the status endpoint response.
 */
export class StatusServiceInfoDto {
  /**
   * Application name.
   */
  @ApiProperty({ example: 'fetchlane' })
  public name: string;

  /**
   * Application version.
   */
  @ApiProperty({ example: '0.0.1' })
  public version: string;

  /**
   * Runtime environment identifier.
   */
  @ApiProperty({ example: 'development' })
  public environment: string;
}

/**
 * Swagger DTO for status runtime metadata.
 */
export class StatusRuntimeDto {
  /**
   * ISO-8601 timestamp when the service started.
   */
  @ApiProperty({ example: '2026-04-02T00:00:00.000Z' })
  public started_at: string;

  /**
   * ISO-8601 timestamp of this status check.
   */
  @ApiProperty({ example: '2026-04-02T00:05:00.000Z' })
  public checked_at: string;

  /**
   * Milliseconds since the service started.
   */
  @ApiProperty({ example: 300000 })
  public uptime_ms: number;

  /**
   * Node.js runtime version.
   */
  @ApiProperty({ example: 'v22.14.0' })
  public node_version: string;

  /**
   * Operating system platform and architecture.
   */
  @ApiProperty({ example: 'darwin/arm64' })
  public platform: string;

  /**
   * Operating system process identifier.
   */
  @ApiProperty({ example: 12996 })
  public pid: number;
}

/**
 * Swagger DTO for safe server config in the status response.
 */
export class StatusConfigServerDto {
  /**
   * Interface address the HTTP listener is bound to.
   */
  @ApiProperty({ example: '0.0.0.0' })
  public host: string;

  /**
   * TCP port the HTTP listener is bound to.
   */
  @ApiProperty({ example: 3000 })
  public port: number;

  /**
   * Whether CORS is enabled for the HTTP server.
   */
  @ApiProperty({ example: true })
  public cors_enabled: boolean;
}

/**
 * Swagger DTO for safe auth config in the status response.
 */
export class StatusConfigAuthDto {
  /**
   * Whether authentication is enabled.
   */
  @ApiProperty({ example: false })
  public enabled: boolean;

  /**
   * Roles that grant full authenticated access.
   */
  @ApiProperty({ example: ['fetchlane-admin'], type: [String] })
  public allowed_roles: string[];
}

/**
 * Swagger DTO for effective operational limits in the status response.
 */
export class StatusConfigLimitsDto {
  /**
   * Maximum accepted HTTP request body size in bytes.
   */
  @ApiProperty({ example: 1048576 })
  public request_body_bytes: number;

  /**
   * Maximum allowed FetchRequest page size.
   */
  @ApiProperty({ example: 1000 })
  public fetch_max_page_size: number;

  /**
   * Maximum number of predicates in a FetchRequest.
   */
  @ApiProperty({ example: 25 })
  public fetch_max_predicates: number;

  /**
   * Maximum number of sort fields in a FetchRequest.
   */
  @ApiProperty({ example: 8 })
  public fetch_max_sort_fields: number;

  /**
   * Rate-limit window length in milliseconds.
   */
  @ApiProperty({ example: 60000 })
  public rate_limit_window_ms: number;

  /**
   * Maximum requests allowed per rate-limit window.
   */
  @ApiProperty({ example: 120 })
  public rate_limit_max: number;
}

/**
 * Swagger DTO for the safe runtime config summary in the status response.
 */
export class StatusConfigDto {
  /**
   * Safe server settings.
   */
  @ApiProperty({ type: StatusConfigServerDto })
  public server: StatusConfigServerDto;

  /**
   * Safe auth summary.
   */
  @ApiProperty({ type: StatusConfigAuthDto })
  public auth: StatusConfigAuthDto;

  /**
   * Effective operational limits.
   */
  @ApiProperty({ type: StatusConfigLimitsDto })
  public limits: StatusConfigLimitsDto;
}

/**
 * Swagger DTO for database capability flags in the status response.
 */
export class StatusDatabaseCapabilitiesDto {
  /**
   * Whether the adapter supports listing tables.
   */
  @ApiProperty({ example: true })
  public table_listing: boolean;

  /**
   * Whether the adapter supports column metadata queries.
   */
  @ApiProperty({ example: true })
  public table_info: boolean;

  /**
   * Whether the adapter supports normalized schema descriptions.
   */
  @ApiProperty({ example: true })
  public schema_description: boolean;

  /**
   * Whether the adapter supports generating CREATE TABLE SQL.
   */
  @ApiProperty({ example: true })
  public create_table_sql: boolean;
}

/**
 * Swagger DTO for database error details in the status response.
 */
export class StatusDatabaseErrorDto {
  /**
   * Human-readable error message.
   */
  @ApiProperty({ example: 'The database connectivity check failed.' })
  public message: string;

  /**
   * Developer-facing hint explaining how to resolve the error.
   */
  @ApiProperty({
    example:
      'Verify the configured database URL, credentials, host, port, driver installation, and that the target database server is reachable.',
  })
  public hint: string;
}

/**
 * Swagger DTO for database status details.
 */
export class StatusDatabaseDto {
  /**
   * Database engine identifier.
   */
  @ApiProperty({ example: 'postgres' })
  public engine: string;

  /**
   * Database host address.
   */
  @ApiProperty({ example: '127.0.0.1' })
  public host: string;

  /**
   * Database port, or `null` when not specified.
   */
  @ApiPropertyOptional({ example: 5432, nullable: true })
  public port: number | null;

  /**
   * Database name.
   */
  @ApiProperty({ example: 'northwind' })
  public database: string;

  /**
   * Whether a successful round-trip to the database was completed.
   */
  @ApiProperty({ example: true })
  public connected: boolean;

  /**
   * Round-trip latency in milliseconds, or `null` on failure.
   */
  @ApiPropertyOptional({ example: 4, nullable: true })
  public round_trip_ms: number | null;

  /**
   * Feature capabilities of the active adapter.
   */
  @ApiProperty({ type: StatusDatabaseCapabilitiesDto })
  public capabilities: StatusDatabaseCapabilitiesDto;

  /**
   * Error details when the connectivity check fails, or `null`.
   */
  @ApiPropertyOptional({
    type: StatusDatabaseErrorDto,
    nullable: true,
  })
  public error: StatusDatabaseErrorDto | null;
}

/**
 * Swagger DTO for useful status links.
 */
export class StatusLinksDto {
  /**
   * URL to the status endpoint itself.
   */
  @ApiProperty({ example: '/api/status' })
  public self: string;

  /**
   * URL to the Swagger documentation.
   */
  @ApiProperty({ example: '/api/docs' })
  public docs: string;
}

/**
 * Swagger DTO for the status endpoint response.
 */
export class StatusResponseDto {
  /**
   * Overall service health indicator.
   */
  @ApiProperty({ example: 'ok' })
  public status: string;

  /**
   * Service identity and version metadata.
   */
  @ApiProperty({ type: StatusServiceInfoDto })
  public service: StatusServiceInfoDto;

  /**
   * Runtime process metadata.
   */
  @ApiProperty({ type: StatusRuntimeDto })
  public runtime: StatusRuntimeDto;

  /**
   * Safe config summary.
   */
  @ApiProperty({ type: StatusConfigDto })
  public config: StatusConfigDto;

  /**
   * Database connectivity and capabilities.
   */
  @ApiProperty({ type: StatusDatabaseDto })
  public database: StatusDatabaseDto;

  /**
   * Useful endpoint links.
   */
  @ApiProperty({ type: StatusLinksDto })
  public links: StatusLinksDto;
}

/**
 * Swagger DTO for a single schema column.
 */
export class TableSchemaColumnDto {
  /**
   * One-based ordinal position within the table.
   */
  @ApiProperty({ example: 1 })
  public ordinal_position: number;

  /**
   * Column name.
   */
  @ApiProperty({ example: 'id' })
  public column_name: string;

  /**
   * Canonical data type name.
   */
  @ApiProperty({ example: 'integer' })
  public data_type: string;

  /**
   * Engine-specific underlying type name.
   */
  @ApiProperty({ example: 'int4' })
  public udt_name: string;

  /**
   * Whether the column accepts `NULL` values.
   */
  @ApiProperty({ example: false })
  public is_nullable: boolean;

  /**
   * Default expression for the column, or `null` when none is set.
   */
  @ApiPropertyOptional({
    example: 'generated always as identity',
    nullable: true,
  })
  public column_default: string | null;

  /**
   * Whether the column is an identity column.
   */
  @ApiProperty({ example: true })
  public is_identity: boolean;

  /**
   * Identity generation strategy, or `null`.
   */
  @ApiPropertyOptional({ example: 'ALWAYS', nullable: true })
  public identity_generation: string | null;

  /**
   * Maximum character length for string types, or `null`.
   */
  @ApiPropertyOptional({ example: 255, nullable: true })
  public character_maximum_length: number | null;

  /**
   * Numeric precision for numeric types, or `null`.
   */
  @ApiPropertyOptional({ example: 32, nullable: true })
  public numeric_precision: number | null;

  /**
   * Numeric scale for numeric types, or `null`.
   */
  @ApiPropertyOptional({ example: 0, nullable: true })
  public numeric_scale: number | null;
}

/**
 * Swagger DTO for a single table constraint.
 */
export class TableSchemaConstraintDto {
  /**
   * Constraint name as defined in the database.
   */
  @ApiProperty({ example: 'member_pkey' })
  public constraint_name: string;

  /**
   * Constraint type (e.g. "PRIMARY KEY", "FOREIGN KEY").
   */
  @ApiProperty({ example: 'PRIMARY KEY' })
  public constraint_type: string;

  /**
   * Column names participating in the constraint.
   */
  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  public columns: string[];

  /**
   * Schema of the referenced table for foreign keys, or `null`.
   */
  @ApiPropertyOptional({ example: 'public', nullable: true })
  public referenced_table_schema: string | null;

  /**
   * Referenced table name for foreign keys, or `null`.
   */
  @ApiPropertyOptional({ example: 'member_group', nullable: true })
  public referenced_table: string | null;

  /**
   * Referenced column names for foreign keys.
   */
  @ApiPropertyOptional({
    example: ['id'],
    type: [String],
  })
  public referenced_columns: string[];

  /**
   * Referential update rule for foreign keys, or `null`.
   */
  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  public update_rule: string | null;

  /**
   * Referential delete rule for foreign keys, or `null`.
   */
  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  public delete_rule: string | null;
}

/**
 * Swagger DTO for a single table index.
 */
export class TableSchemaIndexDto {
  /**
   * Index name as defined in the database.
   */
  @ApiProperty({ example: 'member_pkey' })
  public index_name: string;

  /**
   * Whether the index enforces uniqueness.
   */
  @ApiProperty({ example: true })
  public is_unique: boolean;

  /**
   * Whether the index backs the primary key.
   */
  @ApiProperty({ example: true })
  public is_primary: boolean;

  /**
   * Index access method (e.g. "btree", "hash").
   */
  @ApiProperty({ example: 'btree' })
  public method: string;

  /**
   * Partial index predicate expression, or `null`.
   */
  @ApiPropertyOptional({ example: null, nullable: true })
  public predicate: string | null;

  /**
   * Column names included in the index.
   */
  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  public columns: string[];

  /**
   * Full engine-specific index definition statement.
   */
  @ApiProperty({
    example:
      'CREATE UNIQUE INDEX member_pkey ON public.member USING btree (id)',
  })
  public definition: string;
}

/**
 * Swagger DTO for a full table schema description.
 */
export class TableSchemaDescriptionDto {
  /**
   * Table name.
   */
  @ApiProperty({ example: 'member' })
  public table_name: string;

  /**
   * Schema the table belongs to.
   */
  @ApiProperty({ example: 'public' })
  public table_schema: string;

  /**
   * Table type (e.g. "BASE TABLE", "VIEW").
   */
  @ApiProperty({ example: 'BASE TABLE' })
  public table_type: string;

  /**
   * Column metadata for the table.
   */
  @ApiProperty({ type: [TableSchemaColumnDto] })
  public columns: TableSchemaColumnDto[];

  /**
   * Constraints defined on the table.
   */
  @ApiProperty({ type: [TableSchemaConstraintDto] })
  public constraints: TableSchemaConstraintDto[];

  /**
   * Indexes defined on the table.
   */
  @ApiProperty({ type: [TableSchemaIndexDto] })
  public indexes: TableSchemaIndexDto[];
}
