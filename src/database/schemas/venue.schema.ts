import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type VenueDocument = Venue & Document;

@Schema({ timestamps: true })
export class Venue {
  @Prop({ required: true, unique: true })
  idVenue: string;

  @Prop({ required: true })
  strVenue: string;

  @Prop()
  strAddress?: string;

  @Prop()
  strCity?: string;

  @Prop()
  strCountry?: string;

  @Prop()
  strCapacity?: string;

  @Prop()
  strSurface?: string;

  @Prop()
  strSport?: string;

  @Prop()
  strLeague?: string;

  @Prop()
  strLeagueAlternate?: string;

  @Prop()
  strCountryAlternate?: string;

  @Prop()
  strPostalCode?: string;

  @Prop()
  strDescriptionEN?: string;

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
  strStadiumThumb?: string;

  @Prop()
  strStadiumDescription?: string;

  @Prop()
  strStadiumLocation?: string;

  @Prop()
  intCapacity?: number;

  @Prop()
  strGoogleMaps?: string;

  @Prop()
  strGooglePlusCode?: string;

  @Prop()
  strImage?: string;

  @Prop()
  strMap?: string;

  @Prop({ type: Number })
  lat?: number;

  @Prop({ type: Number })
  lon?: number;
}

export const VenueSchema = SchemaFactory.createForClass(Venue);
