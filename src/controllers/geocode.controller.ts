import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  DataAccessService,
  GeocodedAddress,
} from '../service/data-access.service';
import { GeocodedAddressDto } from '../swagger/models';

@ApiTags('geocode')
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @ApiOperation({ summary: 'Geocode by street name, house number, and city' })
  @ApiParam({ name: 'street', example: 'Museumstraat' })
  @ApiParam({ name: 'number', example: 1 })
  @ApiParam({ name: 'city', example: 'Amsterdam' })
  @ApiOkResponse({ type: GeocodedAddressDto, isArray: true })
  @Get(':street/:number/:city')
  async geocodeAddress(
    @Param('street') street: string,
    @Param('number', ParseIntPipe) houseNumber: number,
    @Param('city') city: string,
  ): Promise<GeocodedAddress[]> {
    return await this.dataAccessService.geocodeByAddress(
      street,
      houseNumber,
      city,
    );
  }

  @ApiOperation({ summary: 'Geocode by postcode and house number' })
  @ApiParam({ name: 'postcode', example: '1071XX' })
  @ApiParam({ name: 'number', example: 1 })
  @ApiOkResponse({ type: GeocodedAddressDto, isArray: true })
  @Get('postcode/:postcode/:number')
  async geocodePostcode(
    @Param('postcode') postcode: string,
    @Param('number', ParseIntPipe) houseNumber: number,
  ): Promise<GeocodedAddress[]> {
    return await this.dataAccessService.geocodeByPostcode(
      postcode,
      houseNumber,
    );
  }
}
