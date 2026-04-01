import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DataAccessController } from './controllers/data-access.controller';
import { GeocodeController } from './controllers/geocode.controller';
import { StatusController } from './controllers/status.controller';
import { StreetsController } from './controllers/streets.controller';
import { databaseProviders } from './data/database.providers';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { DataAccessService } from './service/data-access.service';
import { FetchRequestHandlerService } from './service/fetch-request-handler.service';
import { LoggerService } from './service/logger.service';

/**
 * Root Nest module for the generic data-access application.
 */
@Module({
  imports: [],
  controllers: [
    DataAccessController,
    GeocodeController,
    StatusController,
    StreetsController,
  ],
  providers: [
    LoggerService,
    ...databaseProviders,
    DataAccessService,
    FetchRequestHandlerService,
  ],
})
export class AppModule implements NestModule {
  /** Applies request logging middleware to all public controllers. */
  public configure(consumer: MiddlewareConsumer): void {
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
