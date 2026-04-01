import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoggerService } from '../service/logger.service';
import { StatusResponseDto } from '../swagger/models';

@ApiTags('status')
@Controller('api/status')
/**
 * Minimal status endpoint for liveness checks.
 */
export class StatusController {
  /** Creates the status controller. */
  public constructor(private readonly logger: LoggerService) {}

  @ApiOperation({ summary: 'Get application status' })
  @ApiOkResponse({ type: StatusResponseDto })
  @Get()
  /** Returns a minimal liveness payload for the running application. */
  public index(): any {
    return {
      status: 'Running',
    };
  }
}
