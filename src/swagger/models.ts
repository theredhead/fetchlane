import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Swagger DTO for the status endpoint response. */
export class StatusServiceInfoDto {
  @ApiProperty({ example: 'fetchlane' })
  public name: string;

  @ApiProperty({ example: '0.0.1' })
  public version: string;

  @ApiProperty({ example: 'development' })
  public environment: string;
}

/** Swagger DTO for status runtime metadata. */
export class StatusRuntimeDto {
  @ApiProperty({ example: '2026-04-02T00:00:00.000Z' })
  public started_at: string;

  @ApiProperty({ example: '2026-04-02T00:05:00.000Z' })
  public checked_at: string;

  @ApiProperty({ example: 300000 })
  public uptime_ms: number;

  @ApiProperty({ example: 'v22.14.0' })
  public node_version: string;

  @ApiProperty({ example: 'darwin/arm64' })
  public platform: string;

  @ApiProperty({ example: 12996 })
  public pid: number;
}

/** Swagger DTO for safe server config in the status response. */
export class StatusConfigServerDto {
  @ApiProperty({ example: '0.0.0.0' })
  public host: string;

  @ApiProperty({ example: 3000 })
  public port: number;

  @ApiProperty({ example: true })
  public cors_enabled: boolean;
}

/** Swagger DTO for safe auth config in the status response. */
export class StatusConfigAuthDto {
  @ApiProperty({ example: false })
  public enabled: boolean;

  @ApiProperty({ example: ['fetchlane-admin'], type: [String] })
  public allowed_roles: string[];
}

/** Swagger DTO for effective operational limits in the status response. */
export class StatusConfigLimitsDto {
  @ApiProperty({ example: 1048576 })
  public request_body_bytes: number;

  @ApiProperty({ example: 1000 })
  public fetch_max_page_size: number;

  @ApiProperty({ example: 25 })
  public fetch_max_predicates: number;

  @ApiProperty({ example: 8 })
  public fetch_max_sort_fields: number;

  @ApiProperty({ example: 60000 })
  public rate_limit_window_ms: number;

  @ApiProperty({ example: 120 })
  public rate_limit_max: number;
}

/** Swagger DTO for the safe runtime config summary in the status response. */
export class StatusConfigDto {
  @ApiProperty({ type: StatusConfigServerDto })
  public server: StatusConfigServerDto;

  @ApiProperty({ type: StatusConfigAuthDto })
  public auth: StatusConfigAuthDto;

  @ApiProperty({ type: StatusConfigLimitsDto })
  public limits: StatusConfigLimitsDto;
}

/** Swagger DTO for database capability flags in the status response. */
export class StatusDatabaseCapabilitiesDto {
  @ApiProperty({ example: true })
  public table_listing: boolean;

  @ApiProperty({ example: true })
  public table_info: boolean;

  @ApiProperty({ example: true })
  public schema_description: boolean;

  @ApiProperty({ example: true })
  public create_table_sql: boolean;
}

/** Swagger DTO for database error details in the status response. */
export class StatusDatabaseErrorDto {
  @ApiProperty({ example: 'The database connectivity check failed.' })
  public message: string;

  @ApiProperty({
    example:
      'Verify the configured database URL, credentials, host, port, driver installation, and that the target database server is reachable.',
  })
  public hint: string;
}

/** Swagger DTO for database status details. */
export class StatusDatabaseDto {
  @ApiProperty({ example: 'postgres' })
  public engine: string;

  @ApiProperty({ example: '127.0.0.1' })
  public host: string;

  @ApiPropertyOptional({ example: 5432, nullable: true })
  public port: number | null;

  @ApiProperty({ example: 'northwind' })
  public database: string;

  @ApiProperty({ example: true })
  public connected: boolean;

  @ApiPropertyOptional({ example: 4, nullable: true })
  public round_trip_ms: number | null;

  @ApiProperty({ type: StatusDatabaseCapabilitiesDto })
  public capabilities: StatusDatabaseCapabilitiesDto;

  @ApiPropertyOptional({
    type: StatusDatabaseErrorDto,
    nullable: true,
  })
  public error: StatusDatabaseErrorDto | null;
}

/** Swagger DTO for useful status links. */
export class StatusLinksDto {
  @ApiProperty({ example: '/api/status' })
  public self: string;

  @ApiProperty({ example: '/api/docs' })
  public docs: string;
}

/** Swagger DTO for the status endpoint response. */
export class StatusResponseDto {
  @ApiProperty({ example: 'ok' })
  public status: string;

  @ApiProperty({ type: StatusServiceInfoDto })
  public service: StatusServiceInfoDto;

  @ApiProperty({ type: StatusRuntimeDto })
  public runtime: StatusRuntimeDto;

  @ApiProperty({ type: StatusConfigDto })
  public config: StatusConfigDto;

  @ApiProperty({ type: StatusDatabaseDto })
  public database: StatusDatabaseDto;

  @ApiProperty({ type: StatusLinksDto })
  public links: StatusLinksDto;
}

/** Swagger DTO for a single schema column. */
export class TableSchemaColumnDto {
  @ApiProperty({ example: 1 })
  public ordinal_position: number;

  @ApiProperty({ example: 'id' })
  public column_name: string;

  @ApiProperty({ example: 'integer' })
  public data_type: string;

  @ApiProperty({ example: 'int4' })
  public udt_name: string;

  @ApiProperty({ example: false })
  public is_nullable: boolean;

  @ApiPropertyOptional({
    example: 'generated always as identity',
    nullable: true,
  })
  public column_default: string | null;

  @ApiProperty({ example: true })
  public is_identity: boolean;

  @ApiPropertyOptional({ example: 'ALWAYS', nullable: true })
  public identity_generation: string | null;

  @ApiPropertyOptional({ example: 255, nullable: true })
  public character_maximum_length: number | null;

  @ApiPropertyOptional({ example: 32, nullable: true })
  public numeric_precision: number | null;

  @ApiPropertyOptional({ example: 0, nullable: true })
  public numeric_scale: number | null;
}

/** Swagger DTO for a single table constraint. */
export class TableSchemaConstraintDto {
  @ApiProperty({ example: 'member_pkey' })
  public constraint_name: string;

  @ApiProperty({ example: 'PRIMARY KEY' })
  public constraint_type: string;

  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  public columns: string[];

  @ApiPropertyOptional({ example: 'public', nullable: true })
  public referenced_table_schema: string | null;

  @ApiPropertyOptional({ example: 'member_group', nullable: true })
  public referenced_table: string | null;

  @ApiPropertyOptional({
    example: ['id'],
    type: [String],
  })
  public referenced_columns: string[];

  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  public update_rule: string | null;

  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  public delete_rule: string | null;
}

/** Swagger DTO for a single table index. */
export class TableSchemaIndexDto {
  @ApiProperty({ example: 'member_pkey' })
  public index_name: string;

  @ApiProperty({ example: true })
  public is_unique: boolean;

  @ApiProperty({ example: true })
  public is_primary: boolean;

  @ApiProperty({ example: 'btree' })
  public method: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  public predicate: string | null;

  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  public columns: string[];

  @ApiProperty({
    example: 'CREATE UNIQUE INDEX member_pkey ON public.member USING btree (id)',
  })
  public definition: string;
}

/** Swagger DTO for a full table schema description. */
export class TableSchemaDescriptionDto {
  @ApiProperty({ example: 'member' })
  public table_name: string;

  @ApiProperty({ example: 'public' })
  public table_schema: string;

  @ApiProperty({ example: 'BASE TABLE' })
  public table_type: string;

  @ApiProperty({ type: [TableSchemaColumnDto] })
  public columns: TableSchemaColumnDto[];

  @ApiProperty({ type: [TableSchemaConstraintDto] })
  public constraints: TableSchemaConstraintDto[];

  @ApiProperty({ type: [TableSchemaIndexDto] })
  public indexes: TableSchemaIndexDto[];
}
