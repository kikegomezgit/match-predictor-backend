import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { StatisticsService } from './services/statistics.service';

@ApiTags('statistics')
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('year')
  @ApiOperation({
    summary: 'Get year statistics',
    description:
      'Get comprehensive statistics for a specific year and league, including league table, match statistics, and team performance',
  })
  @ApiQuery({
    name: 'year',
    required: true,
    description: 'Year (2000-2100)',
    example: '2023',
  })
  @ApiQuery({
    name: 'leagueId',
    required: true,
    description: 'League ID (4335 for La Liga, 4346 for MLS)',
    example: '4335',
  })
  @ApiOkResponse({
    description: 'Year statistics including league table and match data',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            leagueTable: { type: 'array' },
            totalMatches: { type: 'number' },
            totalGoals: { type: 'number' },
            averageGoalsPerMatch: { type: 'number' },
            homeWins: { type: 'number' },
            awayWins: { type: 'number' },
            draws: { type: 'number' },
          },
        },
        meta: {
          type: 'object',
          properties: {
            year: { type: 'string' },
            leagueId: { type: 'number' },
            season: { type: 'string' },
            totalTeams: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid year or leagueId parameter' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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

