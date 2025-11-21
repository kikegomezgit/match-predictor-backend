import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { League, LeagueSchema } from '../schemas/league.schema';
import { LeagueSeedService } from './league.seed';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: League.name, schema: LeagueSchema }]),
  ],
  providers: [LeagueSeedService],
})
export class SeedModule {}
