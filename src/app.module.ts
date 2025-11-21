import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { SyncModule } from './sync/sync.module';
import { DatabaseModule } from './database/database.module';
import { SeedModule } from './database/seed/seed.module';
import { PredictionModule } from './prediction/prediction.module';
import { StatisticsModule } from './statistics/statistics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_SRV_URI || ''),
    DatabaseModule,
    SeedModule,
    SyncModule,
    PredictionModule,
    StatisticsModule,
  ],
})
export class AppModule {}
