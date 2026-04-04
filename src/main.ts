import 'dotenv/config';
import { INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';
import { AuthenticationMiddleware } from './authentication/authentication.middleware';
import { getRuntimeConfig } from './config/runtime-config';
import { ApiExceptionFilter } from './filters/api-exception.filter';
import { RateLimitMiddleware } from './limits/rate-limit.middleware';

/**
 * Applies Fetchlane runtime configuration to an already created Nest application.
 */
export function configureApplication(app: INestApplication): void {
  const runtimeConfig = getRuntimeConfig();
  const logger = new Logger('Fetchlane');

  if (!runtimeConfig.authentication.enabled) {
    logger.warn('');
    logger.warn(
      '╔══════════════════════════════════════════════════════════════════╗',
    );
    logger.warn(
      '║  WARNING: Authentication is DISABLED                           ║',
    );
    logger.warn(
      '║                                                                ║',
    );
    logger.warn(
      '║  All tables, rows, and write operations are fully accessible   ║',
    );
    logger.warn(
      '║  without any credentials. Your entire database is exposed to   ║',
    );
    logger.warn(
      '║  anyone who can reach this service.                            ║',
    );
    logger.warn(
      '║                                                                ║',
    );
    logger.warn(
      '║  Never run with authentication.enabled=false outside of a trusted        ║',
    );
    logger.warn(
      '║  local development environment.                                ║',
    );
    logger.warn(
      '║                                                                ║',
    );
    logger.warn(
      '║  Set config.authentication.enabled=true and configure an OIDC provider   ║',
    );
    logger.warn(
      '║  for any network-reachable or production deployment.           ║',
    );
    logger.warn(
      '╚══════════════════════════════════════════════════════════════════╝',
    );
    logger.warn('');
  }

  if (runtimeConfig.server.cors.enabled) {
    app.enableCors({
      origin: runtimeConfig.server.cors.origins.includes('*')
        ? true
        : runtimeConfig.server.cors.origins,
    });
  }
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(
    json({
      limit: runtimeConfig.limits.requestBodyBytes,
    }),
  );
  app.use((error, request, response, next) => {
    if (error?.type !== 'entity.too.large') {
      next(error);
      return;
    }

    response.status(413).json({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'The request body exceeds the configured size limit.',
      hint: `Reduce the request body size or increase limits.requestBodyBytes in the runtime config. Current limit: ${runtimeConfig.limits.requestBodyBytes} bytes.`,
      path: request.originalUrl || request.url,
      timestamp: new Date().toISOString(),
    });
  });
  const authenticationMiddleware = app.get(AuthenticationMiddleware);
  const rateLimitMiddleware = app.get(RateLimitMiddleware);
  app.use(
    (request, response, next) =>
      void authenticationMiddleware.use(request, response, next),
  );
  app.use(
    (request, response, next) =>
      void rateLimitMiddleware.use(request, response, next),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fetchlane API')
    .setDescription(
      'Multi-engine REST API for table access, schema discovery, and FetchRequest querying',
    )
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Required when config.authentication.enabled is true for /api/docs and /api/data-access routes.',
      },
      'bearer',
    )
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}

/**
 * Creates and boots the Nest application, then starts listening for traffic.
 */
export async function bootstrap() {
  const runtimeConfig = getRuntimeConfig();
  const app = await NestFactory.create(AppModule);
  configureApplication(app);

  await app.listen(runtimeConfig.server.port, runtimeConfig.server.host);
}

if (require.main === module) {
  void bootstrap();
}
