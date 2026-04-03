import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StatusService } from '../service/status.service';
import { StatusResponseDto } from '../swagger/models';

@ApiTags('status')
@Controller('api/status')
/**
 * Rich status endpoint for service and database diagnostics.
 */
export class StatusController {
  /**
   * Creates the status controller.
   */
  public constructor(private readonly statusService: StatusService) {}

  @ApiOperation({
    summary: 'Get service status, runtime details, and database health',
  })
  @ApiOkResponse({ type: StatusResponseDto })
  @Get()
  /**
   * Returns a structured status payload for the running application.
   */
  public async index(): Promise<StatusResponseDto> {
    return await this.statusService.getStatus();
  }
}
