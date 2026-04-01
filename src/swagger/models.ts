import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Swagger DTO for the status endpoint response. */
export class StatusResponseDto {
  @ApiProperty({ example: 'Running' })
  public status: string;
}

/** Swagger DTO for nearest-street results. */
export class NearestStreetDto {
  @ApiProperty({ example: '0363300000001911' })
  public openbareruimte_id: string;

  @ApiProperty({ example: 'Damrak' })
  public straatnaam: string;

  @ApiPropertyOptional({ example: '1024', nullable: true })
  public woonplaats_id: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam', nullable: true })
  public woonplaats: string | null;

  @ApiProperty({ example: 52.370216 })
  public latitude: number;

  @ApiProperty({ example: 4.895168 })
  public longitude: number;

  @ApiProperty({ example: 12.34 })
  public distance_m: number;
}

/** Swagger DTO for geocoding results. */
export class GeocodedAddressDto {
  @ApiProperty({ example: 'Museumstraat' })
  public straatnaam: string;

  @ApiProperty({ example: 1 })
  public huisnummer: number;

  @ApiPropertyOptional({ example: null, nullable: true })
  public huisletter: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  public huisnummertoevoeging: string | null;

  @ApiPropertyOptional({ example: '1071XX', nullable: true })
  public postcode: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam', nullable: true })
  public woonplaats: string | null;

  @ApiProperty({ example: 52.359942 })
  public latitude: number;

  @ApiProperty({ example: 4.885386 })
  public longitude: number;
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
