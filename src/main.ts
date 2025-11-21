import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();

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
  SwaggerModule.setup('api-docs', app, document);

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log('Swagger documentation available at: http://localhost:3000/api-docs');
}
bootstrap();
