import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { StatisticsService } from './services/statistics.service';

@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('year')
  async getYearStatistics(
    @Query('year') year: string,
    @Query('leagueId') leagueId: string,
  ) {
    // Validate year
    if (!year) {
      throw new HttpException(
        'year query parameter is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      throw new HttpException(
        'year must be a valid year between 2000 and 2100',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate leagueId
    if (!leagueId) {
      throw new HttpException(
        'leagueId query parameter is required',
        HttpStatus.BAD_REQUEST,
      );
    }

    const leagueIdNum = parseInt(leagueId, 10);
    if (isNaN(leagueIdNum) || (leagueIdNum !== 4335 && leagueIdNum !== 4346)) {
      throw new HttpException(
        'Invalid leagueId. Only 4335 (La Liga) and 4346 (MLS) are allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const statistics = await this.statisticsService.getYearStatistics(
        year,
        leagueIdNum,
      );

      return {
        success: true,
        data: statistics,
        meta: {
          year,
          leagueId: leagueIdNum,
          season: this.statisticsService.formatSeason(year, leagueIdNum),
          totalTeams: statistics.leagueTable.length,
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

