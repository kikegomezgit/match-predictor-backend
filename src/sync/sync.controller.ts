import {
  Controller,
  Post,
  Get,
  Query,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('sync-status')
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
