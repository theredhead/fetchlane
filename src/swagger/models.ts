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
