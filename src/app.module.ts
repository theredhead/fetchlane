import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AuthMiddleware } from './auth/auth.middleware';
import { OidcAuthService } from './auth/oidc-auth.service';
import { DataAccessController } from './controllers/data-access.controller';
import { runtimeConfigProviders } from './config/runtime-config';
import { StatusController } from './controllers/status.controller';
import { databaseProviders } from './data/database.providers';
import { RateLimitMiddleware } from './limits/rate-limit.middleware';
import { RequestLoggerMiddleware } from './middleware/request-logger.middleware';
import { DataAccessService } from './service/data-access.service';
import { DatabaseLifecycleService } from './service/database-lifecycle.service';
import { FetchRequestHandlerService } from './service/fetch-request-handler.service';
import { LoggerService } from './service/logger.service';
import { StatusService } from './service/status.service';

/**
 * Root Nest module for the Fetchlane application.
 */
@Module({
  imports: [],
  controllers: [DataAccessController, StatusController],
  providers: [
    LoggerService,
    AuthMiddleware,
    OidcAuthService,
    RateLimitMiddleware,
    ...runtimeConfigProviders,
    ...databaseProviders,
    DatabaseLifecycleService,
    DataAccessService,
    FetchRequestHandlerService,
    StatusService,
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
