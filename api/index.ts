import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    // NestJS will create Express instance internally via ExpressAdapter
    const app = await NestFactory.create(AppModule, new ExpressAdapter());
    app.enableCors({
      origin: true,
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
