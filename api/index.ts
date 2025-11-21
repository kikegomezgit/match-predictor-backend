import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ExpressAdapter } from '@nestjs/platform-express';

let cachedApp: any;

async function bootstrap() {
  if (!cachedApp) {
    // NestJS will create Express instance internally via ExpressAdapter
    const app = await NestFactory.create(AppModule, new ExpressAdapter());
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
          'https://match-predictor-front-955wyfi90-kikegomez157-gmailcoms-projects.vercel.app',
          'http://localhost:5173', // Vite default dev port
          'http://localhost:3000', // Alternative dev port
          'http://localhost:5174', // Alternative dev port
        ];
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
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
