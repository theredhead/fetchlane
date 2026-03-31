import { Controller, Get, Param, ParseFloatPipe } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  DataAccessService,
  NearestStreet,
} from '../service/data-access.service';
import { NearestStreetDto } from '../swagger/models';

@ApiTags('streets')
@Controller('streets')
export class StreetsController {
  constructor(private readonly dataAccessService: DataAccessService) {}

  @ApiOperation({
    summary:
      'Get the nearest 5 BAG streets from a lat/long pair with ids, city, and nearest point coordinates',
  })
  @ApiParam({ name: 'lat', example: 52.370216 })
  @ApiParam({ name: 'long', example: 4.895168 })
  @ApiOkResponse({ type: NearestStreetDto, isArray: true })
  @Get(':lat/:long')
  async nearestStreets(
    @Param('lat', ParseFloatPipe) latitude: number,
    @Param('long', ParseFloatPipe) longitude: number,
  ): Promise<NearestStreet[]> {
    return await this.dataAccessService.nearestStreets(latitude, longitude);
  }
}
