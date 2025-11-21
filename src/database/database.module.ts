import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Match, MatchSchema } from './schemas/match.schema';
import { Venue, VenueSchema } from './schemas/venue.schema';
import { League, LeagueSchema } from './schemas/league.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Match.name, schema: MatchSchema },
      { name: Venue.name, schema: VenueSchema },
      { name: League.name, schema: LeagueSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
