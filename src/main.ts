import 'dotenv/config';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';
import { AuthMiddleware } from './auth/auth.middleware';
import { getRuntimeConfig } from './config/runtime-config';
import { ApiExceptionFilter } from './filters/api-exception.filter';

/**
 * Applies Fetchlane runtime configuration to an already created Nest application.
 */
export function configureApplication(app: INestApplication): void {
  const runtimeConfig = getRuntimeConfig();
  if (runtimeConfig.server.cors.enabled) {
    app.enableCors({
      origin: runtimeConfig.server.cors.origins.includes('*')
        ? true
        : runtimeConfig.server.cors.origins,
    });
  }
  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  app.use(json());
  const authMiddleware = app.get(AuthMiddleware);
  app.use((request, response, next) =>
    void authMiddleware.use(request, response, next),
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
          'Required when config.auth.enabled is true for /api/docs and /api/data-access routes.',
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
