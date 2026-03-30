import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import {
  DataAccessService,
  GeocodedAddress,
} from '../service/data-access.service';

@Controller('geocode')
export class GeocodeController {
  constructor(private readonly dataAccessService: DataAccessService) {}

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
