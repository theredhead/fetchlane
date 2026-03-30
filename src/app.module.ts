import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DataAccessController } from './controllers/data-access.controller';
import { GeocodeController } from './controllers/geocode.controller';
import { StatusController } from './controllers/status.controller';
import { StreetsController } from './controllers/streets.controller';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { DataAccessService } from './service/data-access.service';
import { FetchRequestHandlerService } from './service/fetch-request-handler.service';
import { LoggerService } from './service/logger.service';
@Module({
  imports: [],
  controllers: [
    DataAccessController,
    GeocodeController,
    StatusController,
    StreetsController,
  ],
  providers: [LoggerService, DataAccessService, FetchRequestHandlerService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestLoggerMiddleware)
      .forRoutes(
        DataAccessController,
        GeocodeController,
        StatusController,
        StreetsController,
      );
  }
}
