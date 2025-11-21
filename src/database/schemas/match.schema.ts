import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MatchDocument = Match & Document;

@Schema({ timestamps: true })
export class Match {
  @Prop({ required: true, unique: true })
  idEvent: string;

  @Prop()
  idAPIfootball?: string;

  @Prop({ required: true })
  strEvent: string;

  @Prop()
  strEventAlternate?: string;

  @Prop()
  strFilename?: string;

  @Prop({ required: true })
  strSport: string;

  @Prop({ required: true, index: true })
  idLeague: string;

  @Prop({ required: true })
  strLeague: string;

  @Prop()
  strLeagueBadge?: string;

  @Prop({ required: true, index: true })
  strSeason: string;

  @Prop()
  strDescriptionEN?: string;

  @Prop({ required: true })
  strHomeTeam: string;

  @Prop({ required: true })
  strAwayTeam: string;

  @Prop()
  intHomeScore?: string;

  @Prop()
  intRound?: string;

  @Prop()
  intAwayScore?: string;

  @Prop()
  intSpectators?: number;

  @Prop()
  strOfficial?: string;

  @Prop({ required: true, index: true })
  strTimestamp: string;

  @Prop({ required: true })
  dateEvent: string;

  @Prop()
  dateEventLocal?: string;

  @Prop()
  strTime?: string;

  @Prop()
  strTimeLocal?: string;

  @Prop()
  strGroup?: string;

  @Prop({ required: true })
  idHomeTeam: string;

  @Prop()
  strHomeTeamBadge?: string;

  @Prop({ required: true })
  idAwayTeam: string;

  @Prop()
  strAwayTeamBadge?: string;

  @Prop()
  intScore?: number;

  @Prop()
  intScoreVotes?: number;

  @Prop()
  strResult?: string;

  @Prop({ required: true, index: true })
  idVenue: string;

  @Prop({ required: true })
  strVenue: string;

  @Prop({ required: true })
  strCountry: string;

  @Prop()
  strCity?: string;

  @Prop()
  strPoster?: string;

  @Prop()
  strSquare?: string;

  @Prop()
  strFanart?: string;

  @Prop()
  strThumb?: string;

  @Prop()
  strBanner?: string;

  @Prop()
  strMap?: string;

  @Prop()
  strTweet1?: string;

  @Prop()
  strTweet2?: string;

  @Prop()
  strTweet3?: string;

  @Prop()
  strVideo?: string;

  @Prop({ required: true })
  strStatus: string;

  @Prop()
  strPostponed?: string;

  @Prop()
  strLocked?: string;

  @Prop({ type: Object })
  weatherAtMatchTime?: {
    temperature?: number;
    feelsLike?: number;
    humidity?: number;
    pressure?: number;
    visibility?: number;
    windSpeed?: number;
    windDirection?: number;
    clouds?: number;
    weather?: string;
    weatherDescription?: string;
    weatherIcon?: string;
    lat?: number;
    lon?: number;
    timestamp?: string;
  };
}

export const MatchSchema = SchemaFactory.createForClass(Match);
