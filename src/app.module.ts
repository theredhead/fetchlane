import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DataAccessController } from './controllers/data-access.controller';
import { StatusController } from './controllers/status.controller';
import { databaseProviders } from './data/database.providers';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { DataAccessService } from './service/data-access.service';
import { DatabaseLifecycleService } from './service/database-lifecycle.service';
import { FetchRequestHandlerService } from './service/fetch-request-handler.service';
import { LoggerService } from './service/logger.service';

/**
 * Root Nest module for the Fetchlane application.
 */
@Module({
  imports: [],
  controllers: [DataAccessController, StatusController],
  providers: [
    LoggerService,
    ...databaseProviders,
    DatabaseLifecycleService,
    DataAccessService,
    FetchRequestHandlerService,
  ],
})
export class AppModule implements NestModule {
  /** Applies request logging middleware to all public controllers. */
  public configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestLoggerMiddleware)
      .forRoutes(DataAccessController, StatusController);
  }
}
