import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';
import { getRuntimeConfig } from './config/runtime-config';
import { ApiExceptionFilter } from './filters/api-exception.filter';

/**
 * Boots the Nest application, enables CORS, and exposes Swagger UI.
 */
export async function bootstrap() {
  const runtimeConfig = getRuntimeConfig();
  const app = await NestFactory.create(AppModule);
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

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Fetchlane API')
    .setDescription(
      'Multi-engine REST API for table access, schema discovery, and FetchRequest querying',
    )
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(runtimeConfig.server.port, runtimeConfig.server.host);
}

if (require.main === module) {
  void bootstrap();
}
