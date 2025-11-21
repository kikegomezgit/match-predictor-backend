import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PredictionController } from './prediction.controller';
import { PredictionService } from './services/prediction.service';
import { DeepSeekService } from './services/deepseek.service';
import { DatabaseModule } from '../database/database.module';
import { UpstashRedisStore } from './stores/upstash-redis.store';

@Module({
  imports: [
    DatabaseModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const upstashUrl = configService.get<string>('UPSTASH_REDIS_REST_URL');
        const upstashToken = configService.get<string>(
          'UPSTASH_REDIS_REST_TOKEN',
        );

        if (!upstashUrl || !upstashToken) {
          throw new Error(
            'UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured',
          );
        }

        return {
          store: new UpstashRedisStore({
            url: upstashUrl,
            token: upstashToken,
            ttl: 3600, // Default TTL: 1 hour
          }),
          ttl: 3600, // Default TTL: 1 hour
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [PredictionController],
  providers: [PredictionService, DeepSeekService],
})
export class PredictionModule {}
