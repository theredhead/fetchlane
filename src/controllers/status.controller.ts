import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { LoggerService } from 'src/service/logger.service';
import { StatusResponseDto } from 'src/swagger/models';

@ApiTags('status')
@Controller('api/status')
export class StatusController {
  @ApiOperation({ summary: 'Get application status' })
  @ApiOkResponse({ type: StatusResponseDto })
  @Get()
  index(): any {
    return {
      status: 'Running',
    };
  }
  constructor(private logger: LoggerService) {}
}
