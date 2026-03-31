import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StatusResponseDto {
  @ApiProperty({ example: 'Running' })
  status: string;
}

export class NearestStreetDto {
  @ApiProperty({ example: '0363300000001911' })
  openbareruimte_id: string;

  @ApiProperty({ example: 'Damrak' })
  straatnaam: string;

  @ApiPropertyOptional({ example: '1024', nullable: true })
  woonplaats_id: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam', nullable: true })
  woonplaats: string | null;

  @ApiProperty({ example: 52.370216 })
  latitude: number;

  @ApiProperty({ example: 4.895168 })
  longitude: number;

  @ApiProperty({ example: 12.34 })
  distance_m: number;
}

export class GeocodedAddressDto {
  @ApiProperty({ example: 'Museumstraat' })
  straatnaam: string;

  @ApiProperty({ example: 1 })
  huisnummer: number;

  @ApiPropertyOptional({ example: null, nullable: true })
  huisletter: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  huisnummertoevoeging: string | null;

  @ApiPropertyOptional({ example: '1071XX', nullable: true })
  postcode: string | null;

  @ApiPropertyOptional({ example: 'Amsterdam', nullable: true })
  woonplaats: string | null;

  @ApiProperty({ example: 52.359942 })
  latitude: number;

  @ApiProperty({ example: 4.885386 })
  longitude: number;
}

export class TableSchemaColumnDto {
  @ApiProperty({ example: 1 })
  ordinal_position: number;

  @ApiProperty({ example: 'id' })
  column_name: string;

  @ApiProperty({ example: 'integer' })
  data_type: string;

  @ApiProperty({ example: 'int4' })
  udt_name: string;

  @ApiProperty({ example: false })
  is_nullable: boolean;

  @ApiPropertyOptional({
    example: 'generated always as identity',
    nullable: true,
  })
  column_default: string | null;

  @ApiProperty({ example: true })
  is_identity: boolean;

  @ApiPropertyOptional({ example: 'ALWAYS', nullable: true })
  identity_generation: string | null;

  @ApiPropertyOptional({ example: 255, nullable: true })
  character_maximum_length: number | null;

  @ApiPropertyOptional({ example: 32, nullable: true })
  numeric_precision: number | null;

  @ApiPropertyOptional({ example: 0, nullable: true })
  numeric_scale: number | null;
}

export class TableSchemaConstraintDto {
  @ApiProperty({ example: 'member_pkey' })
  constraint_name: string;

  @ApiProperty({ example: 'PRIMARY KEY' })
  constraint_type: string;

  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  columns: string[];

  @ApiPropertyOptional({ example: 'public', nullable: true })
  referenced_table_schema: string | null;

  @ApiPropertyOptional({ example: 'member_group', nullable: true })
  referenced_table: string | null;

  @ApiPropertyOptional({
    example: ['id'],
    type: [String],
  })
  referenced_columns: string[];

  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  update_rule: string | null;

  @ApiPropertyOptional({ example: 'NO ACTION', nullable: true })
  delete_rule: string | null;
}

export class TableSchemaIndexDto {
  @ApiProperty({ example: 'member_pkey' })
  index_name: string;

  @ApiProperty({ example: true })
  is_unique: boolean;

  @ApiProperty({ example: true })
  is_primary: boolean;

  @ApiProperty({ example: 'btree' })
  method: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  predicate: string | null;

  @ApiProperty({
    example: ['id'],
    type: [String],
  })
  columns: string[];

  @ApiProperty({
    example: 'CREATE UNIQUE INDEX member_pkey ON public.member USING btree (id)',
  })
  definition: string;
}

export class TableSchemaDescriptionDto {
  @ApiProperty({ example: 'member' })
  table_name: string;

  @ApiProperty({ example: 'public' })
  table_schema: string;

  @ApiProperty({ example: 'BASE TABLE' })
  table_type: string;

  @ApiProperty({ type: [TableSchemaColumnDto] })
  columns: TableSchemaColumnDto[];

  @ApiProperty({ type: [TableSchemaConstraintDto] })
  constraints: TableSchemaConstraintDto[];

  @ApiProperty({ type: [TableSchemaIndexDto] })
  indexes: TableSchemaIndexDto[];
}
