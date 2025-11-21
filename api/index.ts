import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';

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
