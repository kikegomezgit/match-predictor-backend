import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { League, LeagueDocument } from '../schemas/league.schema';

@Injectable()
export class LeagueSeedService implements OnModuleInit {
  constructor(
    @InjectModel(League.name) private leagueModel: Model<LeagueDocument>,
  ) {}

  async onModuleInit() {
    await this.seedLeagues();
  }

  async seedLeagues() {
    const leagues = [
      {
        idLeague: '4335',
        strLeague: 'Spanish La Liga',
        strLeagueAlternate: 'La Liga',
        strSport: 'Soccer',
        strCountry: 'Spain',
        strDescriptionEN:
          'The top professional football division of the Spanish football league system.',
        imageUrl:
          'https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png',
        strBadge:
          'https://r2.thesportsdb.com/images/media/league/badge/ja4it51687628717.png',
      },
      {
        idLeague: '4346',
        strLeague: 'Major League Soccer',
        strLeagueAlternate: 'MLS',
        strSport: 'Soccer',
        strCountry: 'USA',
        strDescriptionEN:
          'The top professional soccer league in the United States and Canada.',
        imageUrl:
          'https://www.thesportsdb.com/images/media/league/badge/4346.png',
        strBadge:
          'https://www.thesportsdb.com/images/media/league/badge/4346.png',
      },
    ];

    for (const leagueData of leagues) {
      try {
        const existingLeague = await this.leagueModel.findOne({
          idLeague: leagueData.idLeague,
        });

        if (!existingLeague) {
          await this.leagueModel.create(leagueData);
        } else {
          // Update existing league with latest data
          await this.leagueModel.updateOne(
            { idLeague: leagueData.idLeague },
            leagueData,
          );
        }
      } catch (error) {
        console.error(
          `Error seeding league ${leagueData.idLeague}:`,
          error.message,
        );
      }
    }
  }
}
