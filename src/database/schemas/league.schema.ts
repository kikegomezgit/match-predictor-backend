import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LeagueDocument = League & Document;

@Schema({ timestamps: true })
export class League {
  @Prop({ required: true, unique: true })
  idLeague: string;

  @Prop({ required: true })
  strLeague: string;

  @Prop()
  strLeagueAlternate?: string;

  @Prop({ required: true })
  strSport: string;

  @Prop()
  strCountry?: string;

  @Prop()
  strDescriptionEN?: string;

  @Prop()
  strBadge?: string;

  @Prop()
  strLogo?: string;

  @Prop()
  strBanner?: string;

  @Prop()
  strFanart1?: string;

  @Prop()
  strFanart2?: string;

  @Prop()
  strFanart3?: string;

  @Prop()
  strFanart4?: string;

  @Prop()
  strWebsite?: string;

  @Prop()
  strFacebook?: string;

  @Prop()
  strTwitter?: string;

  @Prop()
  strInstagram?: string;

  @Prop()
  strYoutube?: string;

  @Prop()
  strRSS?: string;

  @Prop()
  intFormedYear?: number;

  @Prop()
  dateFirstEvent?: string;

  @Prop()
  strGender?: string;

  @Prop()
  strCountryAlternate?: string;

  @Prop()
  strNaming?: string;

  @Prop()
  strLocked?: string;

  @Prop({ required: true })
  imageUrl: string;
}

export const LeagueSchema = SchemaFactory.createForClass(League);
