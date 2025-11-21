import {
  Controller,
  Post,
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
import { SyncService } from './sync.service';

@ApiTags('sync')
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('sync-status')
  @ApiOperation({ summary: 'Get sync process status' })
  @ApiOkResponse({
    description: 'Returns the current status of the sync process',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            isRunning: { type: 'boolean' },
            status: {
              type: 'object',
              nullable: true,
              properties: {
                startedAt: { type: 'string', nullable: true },
                currentLeague: { type: 'number', nullable: true },
                currentLeagueName: { type: 'string', nullable: true },
                status: { type: 'string', nullable: true },
                completedAt: { type: 'string', nullable: true },
                error: { type: 'string', nullable: true },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getSyncStatus() {
    try {
      const status = await this.syncService.getSyncStatus();
      return {
        success: true,
        data: status,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get sync status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('upcoming-matches')
  @ApiOperation({ summary: 'Get upcoming matches for a league' })
  @ApiQuery({
    name: 'leagueId',
    required: true,
    description: 'League ID (4335 for La Liga, 4346 for MLS)',
    example: '4335',
  })
  @ApiOkResponse({
    description: 'Returns upcoming matches for the specified league',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: { type: 'array', items: { type: 'object' } },
        count: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid leagueId parameter' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  async getUpcomingMatches(@Query('leagueId') leagueId: string) {
    const leagueIdNum = parseInt(leagueId, 10);

    // Validate leagueId
    if (!leagueId || isNaN(leagueIdNum)) {
      throw new HttpException(
        'leagueId query parameter is required and must be a number',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (leagueIdNum !== 4335 && leagueIdNum !== 4346) {
      throw new HttpException(
        'Invalid leagueId. Only 4335 (La Liga) and 4346 (MLS) are allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const matches = await this.syncService.getUpcomingMatches(leagueIdNum);
      return {
        success: true,
        data: matches,
        count: matches.length,
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to fetch upcoming matches',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('previous-matches')
  @ApiOperation({
    summary: 'Start syncing previous matches',
    description:
      'Starts a background process to sync historical match data. Returns immediately with acknowledgment.',
  })
  @ApiQuery({
    name: 'yearsToSync',
    required: false,
    description: 'Number of years to sync (1-20, default: 5)',
    example: '5',
  })
  @ApiOkResponse({
    description: 'Sync process started successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            status: { type: 'string' },
            yearsToSync: { type: 'number' },
            leagues: { type: 'array', items: { type: 'number' } },
            message: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'Sync process is already running',
  })
  @ApiResponse({ status: 400, description: 'Invalid yearsToSync parameter' })
  async syncPreviousMatches(@Query('yearsToSync') yearsToSyncParam?: string) {
    // Check if sync is already running using cache flag
    const isRunning = await this.syncService.isSyncRunning();
    if (isRunning) {
      throw new HttpException(
        {
          success: false,
          message:
            'Sync process is already running. Please wait for it to complete.',
          error: 'SYNC_IN_PROGRESS',
        },
        HttpStatus.CONFLICT,
      );
    }

    let yearsToSync = 5; // Default value
    if (yearsToSyncParam) {
      const parsed = parseInt(yearsToSyncParam, 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 20) {
        throw new HttpException(
          'yearsToSync query parameter must be between 1 and 20',
          HttpStatus.BAD_REQUEST,
        );
      }
      yearsToSync = parsed;
    }

    // Double-check lock before starting (race condition protection)
    // Set lock immediately to prevent concurrent requests
    const lockAcquired = await this.syncService.acquireSyncLock(yearsToSync);
    if (!lockAcquired) {
      throw new HttpException(
        {
          success: false,
          message:
            'Sync process is already running. Please wait for it to complete.',
          error: 'SYNC_IN_PROGRESS',
        },
        HttpStatus.CONFLICT,
      );
    }

    // Start sync process in background (don't await)
    // This allows the endpoint to return immediately
    this.syncService.syncAllLeaguesInBackground(yearsToSync).catch((error) => {
      // Error is already logged in the service, but we ensure it doesn't crash the app
      console.error('[SYNC] Background sync error:', error);
    });

    // Return immediately with acknowledgment
    return {
      success: true,
      message: 'Sync process started in background',
      data: {
        status: 'started',
        yearsToSync,
        leagues: [4335, 4346],
        message:
          'The sync process is running in the background. Use GET /sync/sync-status to check progress.',
      },
    };
  }
}
