import { Controller, Get, Param, ParseFloatPipe } from '@nestjs/common';
import {
  DataAccessService,
  NearestStreet,
} from '../service/data-access.service';

@Controller('streets')
export class StreetsController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @Get(':lat/:long')
  async nearestStreets(
    @Param('lat', ParseFloatPipe) latitude: number,
    @Param('long', ParseFloatPipe) longitude: number,
  ): Promise<NearestStreet[]> {
    return await this.dataAccessService.nearestStreets(latitude, longitude);
  }
}
