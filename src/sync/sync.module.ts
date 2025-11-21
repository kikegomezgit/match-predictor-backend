import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';
import { SportsService } from './services/sports.service';
import { WeatherService } from './services/weather.service';
import { DatabaseModule } from '../database/database.module';
import { UpstashRedisStore } from '../prediction/stores/upstash-redis.store';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
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
  controllers: [SyncController],
  providers: [SyncService, SportsService, WeatherService],
})
export class SyncModule {}
