import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    // NestJS will create Express instance internally via ExpressAdapter
    const app = await NestFactory.create(AppModule, new ExpressAdapter());
    app.enableCors({
      origin: true, // Allow all origins (Vercel preview URLs change on each deployment)
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
      credentials: true,
    });

    // Swagger configuration
    const config = new DocumentBuilder()
      .setTitle('Match Predictor API')
      .setDescription(
        'API for syncing sports matches with weather data and making predictions',
      )
      .setVersion('1.0')
      .addTag('sync', 'Match synchronization endpoints')
      .addTag('prediction', 'AI-powered match prediction endpoints')
      .addTag('statistics', 'Match statistics endpoints')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      customCssUrl:
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
      customJs: [
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
        'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js',
      ],
      customSiteTitle: 'Match Predictor API Documentation',
      swaggerOptions: {
        persistAuthorization: true,
      },
    });

    await app.init();
    // Get the underlying Express instance from NestJS
    cachedApp = app.getHttpAdapter().getInstance();
  }
  return cachedApp;
}

export default async function handler(req: any, res: any) {
  const app = await bootstrap();
  return app(req, res);
}
