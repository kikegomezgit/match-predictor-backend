import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Match, MatchDocument } from '../database/schemas/match.schema';
import { Venue, VenueDocument } from '../database/schemas/venue.schema';
import { SportsService } from './services/sports.service';
import { WeatherService } from './services/weather.service';

const SYNC_LOCK_KEY = 'sync:previous-matches:lock';
const SYNC_STATUS_KEY = 'sync:previous-matches:status';
const DEFAULT_YEARS_TO_SYNC = 5;

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectModel(Match.name) private matchModel: Model<MatchDocument>,
    @InjectModel(Venue.name) private venueModel: Model<VenueDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private sportsService: SportsService,
    private weatherService: WeatherService,
  ) {}

  /**
   * Fetches upcoming matches for a league without storing them
   * Enriches matches with weather data from OpenWeather API
   * Used for frontend display only
   */
  async getUpcomingMatches(leagueId: number): Promise<any[]> {
    const matches = await this.sportsService.getUpcomingMatches(leagueId);

    // Enrich each match with weather data
    const enrichedMatches = await Promise.all(
      matches.map(async (match) => {
        try {
          let lat: number | undefined;
          let lon: number | undefined;

          // First, check if venue exists in our database
          const venueInDb = await this.venueModel.findOne({
            $or: [{ idVenue: match.idVenue }, { strVenue: match.strVenue }],
          });

          if (venueInDb && venueInDb.lat && venueInDb.lon) {
            // Use coordinates from database
            lat = venueInDb.lat;
            lon = venueInDb.lon;
            console.log(
              `[UPCOMING] Found venue ${match.strVenue} in DB: lat=${lat}, lon=${lon}`,
            );
          } else {
            // Venue not in DB, search SportsDB API
            console.log(
              `[UPCOMING] Venue ${match.strVenue} not in DB, searching SportsDB...`,
            );
            const venueData = await this.sportsService.searchVenue(
              match.strVenue,
            );

            if (venueData) {
              // Extract coordinates from strMap field
              if (venueData.strMap) {
                const coordinates = this.extractCoordinatesFromStrMap(
                  venueData.strMap,
                );
                if (coordinates) {
                  lat = coordinates.lat;
                  lon = coordinates.lon;
                }
              }

              // Fallback to other coordinate fields if strMap doesn't have coordinates
              if (!lat || !lon) {
                lat =
                  venueData.doubleLat !== undefined
                    ? parseFloat(venueData.doubleLat)
                    : venueData.strLatitude !== undefined
                      ? parseFloat(venueData.strLatitude)
                      : undefined;
                lon =
                  venueData.doubleLong !== undefined
                    ? parseFloat(venueData.doubleLong)
                    : venueData.strLongitude !== undefined
                      ? parseFloat(venueData.strLongitude)
                      : undefined;
              }

              // Save venue to database for future use
              if (lat && lon && match.idVenue) {
                const venueUpdate: any = {
                  idVenue: match.idVenue,
                  strVenue: match.strVenue,
                  strCity: match.strCity || venueData.strCity,
                  strCountry: match.strCountry || venueData.strCountry,
                  strCapacity: venueData.strCapacity,
                  strSurface: venueData.strSurface,
                  strSport: venueData.strSport,
                  strLeague: venueData.strLeague,
                  strMap: venueData.strMap,
                  lat,
                  lon,
                };

                await this.venueModel.findOneAndUpdate(
                  { idVenue: match.idVenue },
                  venueUpdate,
                  { upsert: true, new: true },
                );
                console.log(
                  `[UPCOMING] Saved venue ${match.strVenue} to DB: lat=${lat}, lon=${lon}`,
                );
              }
            }
          }

          // Get weather data if we have coordinates and timestamp
          let weatherData = null;
          if (lat && lon && match.strTimestamp) {
            try {
              weatherData = await this.weatherService.getWeatherAtTimestamp(
                lat,
                lon,
                match.strTimestamp,
              );
              if (weatherData) {
                console.log(
                  `[UPCOMING] ✓ Weather data fetched for ${match.strEvent}`,
                );
              }
            } catch (error) {
              console.error(
                `[UPCOMING] Failed to fetch weather for match ${match.idEvent}:`,
                error.message,
              );
            }
          }
          return {
            ...match,
            weatherAtMatchTime: weatherData,
          };
        } catch (error) {
          console.error(
            `[UPCOMING] Error enriching match ${match.idEvent}:`,
            error.message,
          );
          // Return match without weather data if enrichment fails
          return {
            ...match,
            weatherAtMatchTime: null,
          };
        }
      }),
    );

    return enrichedMatches;
  }

  /**
   * Checks if sync process is currently running
   */
  async isSyncRunning(): Promise<boolean> {
    const lock = await this.cacheManager.get<string>(SYNC_LOCK_KEY);
    return lock === 'running';
  }

  /**
   * Gets current sync status
   * Returns status even if not running (to show completed/error status)
   */
  async getSyncStatus(): Promise<{
    isRunning: boolean;
    status?: any;
  }> {
    const isRunning = await this.isSyncRunning();
    const status = await this.cacheManager.get<any>(SYNC_STATUS_KEY);

    return {
      isRunning,
      status: status || null,
    };
  }

  /**
   * Attempts to acquire sync lock atomically
   * Returns true if lock was acquired, false if already locked
   */
  async acquireSyncLock(yearsToSync: number): Promise<boolean> {
    // Check if already running
    const isRunning = await this.isSyncRunning();
    if (isRunning) {
      return false;
    }

    // Set lock atomically
    await this.setSyncLock(true, {
      startedAt: new Date().toISOString(),
      leagues: [4335, 4346],
      yearsToSync,
    });

    return true;
  }

  /**
   * Sets sync lock and status
   */
  private async setSyncLock(running: boolean, status?: any): Promise<void> {
    if (running) {
      await this.cacheManager.set(SYNC_LOCK_KEY, 'running', 7200000); // 2 hours max
      if (status) {
        await this.cacheManager.set(SYNC_STATUS_KEY, status, 7200000);
      }
    } else {
      await this.cacheManager.del(SYNC_LOCK_KEY);
      await this.cacheManager.del(SYNC_STATUS_KEY);
    }
  }

  /**
   * Starts sync process in background (non-blocking)
   * Returns immediately, sync runs asynchronously
   * Note: Lock should already be acquired before calling this method
   */
  async syncAllLeaguesInBackground(
    yearsToSync: number = DEFAULT_YEARS_TO_SYNC,
  ): Promise<void> {
    // Double-check lock before starting (extra safety)
    const isRunning = await this.isSyncRunning();
    if (!isRunning) {
      this.logger.warn(
        '[SYNC] Lock not found when starting background sync. This should not happen.',
      );
      // Try to acquire lock again
      const lockAcquired = await this.acquireSyncLock(yearsToSync);
      if (!lockAcquired) {
        this.logger.error(
          '[SYNC] Failed to acquire lock for background sync. Aborting.',
        );
        return;
      }
    }

    // Run sync in background without blocking
    this.syncAllLeagues(yearsToSync).catch((error) => {
      this.logger.error(
        `[SYNC] Background sync failed: ${error.message}`,
        error.stack,
      );
      // Update status with error
      this.cacheManager.set(
        SYNC_STATUS_KEY,
        {
          status: 'error',
          error: error.message,
          completedAt: new Date().toISOString(),
        },
        3600000, // Keep error status for 1 hour
      );
      // Release lock
      this.setSyncLock(false).catch((lockError) => {
        this.logger.error(
          `[SYNC] Failed to release lock: ${lockError.message}`,
        );
      });
    });
  }

  /**
   * Syncs both leagues (4335 and 4346) together
   * This ensures proper rate limiting across both leagues
   */
  async syncAllLeagues(yearsToSync: number = DEFAULT_YEARS_TO_SYNC): Promise<{
    totalMatches: number;
    syncedMatches: number;
    skippedMatches: number;
    skippedSeasons: number;
    leagues: {
      leagueId: number;
      leagueName: string;
      totalMatches: number;
      syncedMatches: number;
      skippedMatches: number;
      skippedSeasons: number;
    }[];
  }> {
    // Check if sync is already running (lock should already be set by controller)
    if (await this.isSyncRunning()) {
      // Verify we own the lock by checking status
      const status = await this.cacheManager.get<any>(SYNC_STATUS_KEY);
      if (status && status.yearsToSync === yearsToSync) {
        // We own the lock, proceed
        this.logger.log(
          `[SYNC] Lock verified. Continuing sync with ${yearsToSync} years`,
        );
      } else {
        // Different sync is running
        throw new Error(
          'Sync process is already running. Please wait for it to complete.',
        );
      }
    } else {
      // Lock was lost somehow, re-acquire it
      this.logger.warn(
        '[SYNC] Lock not found in syncAllLeagues. Re-acquiring...',
      );
      await this.setSyncLock(true, {
        startedAt: new Date().toISOString(),
        leagues: [4335, 4346],
        yearsToSync,
      });
    }

    try {
      this.logger.log(
        `[SYNC] Starting sync for both leagues (4335, 4346) with ${yearsToSync} years`,
      );

      const leagues = [
        { id: 4335, name: 'La Liga' },
        { id: 4346, name: 'MLS' },
      ];

      let totalMatches = 0;
      let totalSyncedMatches = 0;
      let totalSkippedMatches = 0;
      let totalSkippedSeasons = 0;
      const leagueResults = [];

      for (const league of leagues) {
        this.logger.log(
          `[SYNC] Processing league ${league.id} (${league.name})...`,
        );

        // Update status
        const currentStatus = await this.cacheManager.get<any>(SYNC_STATUS_KEY);
        await this.setSyncLock(true, {
          startedAt: currentStatus?.startedAt || new Date().toISOString(),
          currentLeague: league.id,
          currentLeagueName: league.name,
          leagues: [4335, 4346],
          yearsToSync,
        });

        const result = await this.syncPreviousMatches(league.id, yearsToSync);

        totalMatches += result.totalMatches;
        totalSyncedMatches += result.syncedMatches;
        totalSkippedMatches += result.skippedMatches;
        totalSkippedSeasons += result.skippedSeasons;

        leagueResults.push({
          leagueId: league.id,
          leagueName: league.name,
          ...result,
        });

        this.logger.log(
          `[SYNC] Completed league ${league.id}: ${result.syncedMatches} synced, ${result.skippedMatches} updated, ${result.skippedSeasons} seasons skipped`,
        );
      }

      const finalResult = {
        totalMatches,
        syncedMatches: totalSyncedMatches,
        skippedMatches: totalSkippedMatches,
        skippedSeasons: totalSkippedSeasons,
        leagues: leagueResults,
      };

      this.logger.log(
        `[SYNC] ✓ Completed sync for both leagues. Total: ${totalMatches} matches, ${totalSyncedMatches} synced, ${totalSkippedMatches} updated`,
      );

      // Update final status with success
      const currentStatus = await this.cacheManager.get<any>(SYNC_STATUS_KEY);
      await this.cacheManager.set(
        SYNC_STATUS_KEY,
        {
          ...currentStatus,
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: finalResult,
        },
        3600000, // Keep completed status for 1 hour
      );

      return finalResult;
    } catch (error: any) {
      this.logger.error(
        `[SYNC] ✗ Error during sync: ${error.message}`,
        error.stack,
      );

      // Update status with error
      const currentStatus = await this.cacheManager.get<any>(SYNC_STATUS_KEY);
      await this.cacheManager.set(
        SYNC_STATUS_KEY,
        {
          ...currentStatus,
          status: 'error',
          error: error.message,
          completedAt: new Date().toISOString(),
        },
        3600000, // Keep error status for 1 hour
      );

      // Re-throw error so it can be caught by background handler
      throw error;
    } finally {
      // Always release lock
      await this.setSyncLock(false);
    }
  }

  async syncPreviousMatches(
    leagueId: number,
    yearsToSync: number,
  ): Promise<{
    totalMatches: number;
    syncedMatches: number;
    skippedMatches: number;
    skippedSeasons: number;
  }> {
    const currentYear = new Date().getFullYear();
    let totalMatches = 0;
    let syncedMatches = 0;
    let skippedMatches = 0;
    let skippedSeasons = 0;

    // Sync from current year backwards for the specified number of years
    // If yearsToSync is 5 and currentYear is 2025, it will sync: 2025, 2024, 2023, 2022, 2021, 2020
    // This means we need to iterate from 0 to yearsToSync (inclusive) to get yearsToSync+1 years total
    // Example: yearsToSync=5 means sync 6 years (current year + 5 past years)
    for (let i = 0; i <= yearsToSync; i++) {
      const year = currentYear - i;
      let season: string;

      // Format season based on league
      if (leagueId === 4335) {
        // La Liga format: 2025-2026
        season = `${year}-${year + 1}`;
      } else if (leagueId === 4346) {
        // MLS format: 2025
        season = year.toString();
      } else {
        throw new Error(`Unsupported leagueId: ${leagueId}`);
      }

      // Check if season already has records in database
      // Only skip if it's NOT the current year (past data doesn't change)
      const isCurrentYear = year === currentYear;
      const existingMatchesCount = await this.matchModel.countDocuments({
        idLeague: leagueId.toString(),
        strSeason: season,
      });

      if (!isCurrentYear && existingMatchesCount > 0) {
        console.log(
          `Season ${season} already has ${existingMatchesCount} records in database. Skipping API call (past data doesn't change).`,
        );
        skippedSeasons++;
        totalMatches += existingMatchesCount;
        continue;
      }

      console.log(`Syncing season ${season} for league ${leagueId}...`);

      try {
        const matches = await this.sportsService.getMatchesBySeason(
          leagueId,
          season,
        );

        totalMatches += matches.length;

        for (const matchData of matches) {
          try {
            // Always search for venue coordinates using strVenue for each match
            const venueData = await this.sportsService.searchVenue(
              matchData.strVenue,
            );

            let lat: number | undefined;
            let lon: number | undefined;

            if (venueData) {
              // Extract coordinates from strMap field (DMS format: "39°28′29″N 0°21′30″W")
              if (venueData.strMap) {
                const coordinates = this.extractCoordinatesFromStrMap(
                  venueData.strMap,
                );
                if (coordinates) {
                  lat = coordinates.lat;
                  lon = coordinates.lon;
                }
              }

              // Fallback to other coordinate fields if strMap doesn't have coordinates
              if (!lat || !lon) {
                lat =
                  venueData.doubleLat !== undefined
                    ? parseFloat(venueData.doubleLat)
                    : venueData.strLatitude !== undefined
                      ? parseFloat(venueData.strLatitude)
                      : undefined;
                lon =
                  venueData.doubleLong !== undefined
                    ? parseFloat(venueData.doubleLong)
                    : venueData.strLongitude !== undefined
                      ? parseFloat(venueData.strLongitude)
                      : undefined;
              }

              // Update or create venue in database
              const venueUpdate: any = {
                idVenue: matchData.idVenue,
                strVenue: matchData.strVenue,
                strCity: matchData.strCity || venueData.strCity,
                strCountry: matchData.strCountry || venueData.strCountry,
                strCapacity: venueData.strCapacity,
                strSurface: venueData.strSurface,
                strSport: venueData.strSport,
                strLeague: venueData.strLeague,
                strMap: venueData.strMap,
                lat,
                lon,
              };

              await this.venueModel.findOneAndUpdate(
                { idVenue: matchData.idVenue },
                venueUpdate,
                { upsert: true, new: true },
              );
            }

            // Get weather data if we have coordinates (one call per match)
            let weatherData = null;
            if (lat && lon) {
              try {
                weatherData = await this.weatherService.getWeatherAtTimestamp(
                  lat,
                  lon,
                  matchData.strTimestamp,
                );
              } catch (error) {
                console.error(
                  `Failed to fetch weather for match ${matchData.idEvent}:`,
                  error.message,
                );
              }
            }

            // Prepare match document
            const matchDocument: any = {
              idEvent: matchData.idEvent,
              idAPIfootball: matchData.idAPIfootball,
              strEvent: matchData.strEvent,
              strEventAlternate: matchData.strEventAlternate,
              strFilename: matchData.strFilename,
              strSport: matchData.strSport,
              idLeague: matchData.idLeague,
              strLeague: matchData.strLeague,
              strLeagueBadge: matchData.strLeagueBadge,
              strSeason: matchData.strSeason,
              strDescriptionEN: matchData.strDescriptionEN,
              strHomeTeam: matchData.strHomeTeam,
              strAwayTeam: matchData.strAwayTeam,
              intHomeScore: matchData.intHomeScore,
              intRound: matchData.intRound,
              intAwayScore: matchData.intAwayScore,
              intSpectators: matchData.intSpectators
                ? parseInt(matchData.intSpectators)
                : undefined,
              strOfficial: matchData.strOfficial,
              strTimestamp: matchData.strTimestamp,
              dateEvent: matchData.dateEvent,
              dateEventLocal: matchData.dateEventLocal,
              strTime: matchData.strTime,
              strTimeLocal: matchData.strTimeLocal,
              strGroup: matchData.strGroup,
              idHomeTeam: matchData.idHomeTeam,
              strHomeTeamBadge: matchData.strHomeTeamBadge,
              idAwayTeam: matchData.idAwayTeam,
              strAwayTeamBadge: matchData.strAwayTeamBadge,
              intScore: matchData.intScore
                ? parseInt(matchData.intScore)
                : undefined,
              intScoreVotes: matchData.intScoreVotes
                ? parseInt(matchData.intScoreVotes)
                : undefined,
              strResult: matchData.strResult,
              idVenue: matchData.idVenue,
              strVenue: matchData.strVenue,
              strCountry: matchData.strCountry,
              strCity: matchData.strCity,
              strPoster: matchData.strPoster,
              strSquare: matchData.strSquare,
              strFanart: matchData.strFanart,
              strThumb: matchData.strThumb,
              strBanner: matchData.strBanner,
              strMap: matchData.strMap,
              strTweet1: matchData.strTweet1,
              strTweet2: matchData.strTweet2,
              strTweet3: matchData.strTweet3,
              strVideo: matchData.strVideo,
              strStatus: matchData.strStatus,
              strPostponed: matchData.strPostponed,
              strLocked: matchData.strLocked,
              weatherAtMatchTime: weatherData,
            };

            // Check if match already exists before upsert
            const existingMatch = await this.matchModel.findOne({
              idEvent: matchData.idEvent,
            });

            // Use upsert: update if exists (based on idEvent), insert if not
            await this.matchModel.findOneAndUpdate(
              { idEvent: matchData.idEvent },
              matchDocument,
              { upsert: true, new: true, setDefaultsOnInsert: true },
            );

            if (existingMatch) {
              skippedMatches++;
              console.log(
                `Updated match ${matchData.idEvent}: ${matchData.strEvent}`,
              );
            } else {
              syncedMatches++;
              console.log(
                `Created match ${matchData.idEvent}: ${matchData.strEvent}`,
              );
            }
          } catch (error) {
            console.error(
              `Error syncing match ${matchData.idEvent}:`,
              error.message,
            );
            skippedMatches++;
          }
        }

        console.log(
          `Completed season ${season}: ${matches.length} matches processed`,
        );
      } catch (error) {
        console.error(`Error syncing season ${season}:`, error.message);
        throw error;
      }
    }

    return {
      totalMatches,
      syncedMatches,
      skippedMatches,
      skippedSeasons,
    };
  }

  /**
   * Extracts latitude and longitude from strMap field
   *
   * Supported strMap formats (in order of checking):
   * 1. Decimal degrees with comma: "30.3877, -97.7195" or "30.3877,-97.7195"
   * 2. Google Maps URL: "?q=30.3877,-97.7195" or "&q=30.3877,-97.7195"
   * 3. Decimal degrees with direction: "34.013°N 118.285°W"
   * 4. DMS with decimal minutes: "29°45.132′N 95°21.144′W" (NEW - decimal minutes)
   * 5. DMS format (full): "39°28′29″N 0°21′30″W" (Degrees Minutes Seconds)
   * 6. DMS with decimal seconds: "39°58′6.46″N 83°1′1.52″W" (decimal seconds)
   *
   * TheSportsDB can return any of these formats depending on the venue data source.
   */
  private extractCoordinatesFromStrMap(
    strMap: string,
  ): { lat: number; lon: number } | null {
    if (!strMap || strMap.trim() === '') {
      console.log(`[COORDS FAILED] strMap is empty or null`);
      return null;
    }

    console.log(`[COORDS] Parsing strMap: "${strMap}"`);

    try {
      // Try format 1: Decimal degrees format "30.3877, -97.7195" or "30.3877,-97.7195"
      const decimalPattern = /([+-]?\d+\.?\d*)\s*,\s*([+-]?\d+\.?\d*)/;
      const decimalMatch = strMap.match(decimalPattern);

      if (decimalMatch && decimalMatch.length === 3) {
        const lat = parseFloat(decimalMatch[1]);
        const lon = parseFloat(decimalMatch[2]);

        // Validate coordinates
        if (
          !isNaN(lat) &&
          !isNaN(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180
        ) {
          console.log(`[COORDS] ✓ Format 1 (decimal): lat=${lat}, lon=${lon}`);
          return { lat, lon };
        }
      }

      // Try format 2: Google Maps URL format "?q=30.3877,-97.7195" or "&q=30.3877,-97.7195"
      const urlPattern = /[?&]q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/;
      const urlMatch = strMap.match(urlPattern);

      if (urlMatch && urlMatch.length === 3) {
        const lat = parseFloat(urlMatch[1]);
        const lon = parseFloat(urlMatch[2]);

        // Validate coordinates
        if (
          !isNaN(lat) &&
          !isNaN(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180
        ) {
          console.log(`[COORDS] ✓ Format 2 (URL): lat=${lat}, lon=${lon}`);
          return { lat, lon };
        }
      }

      // Try format 3: Decimal degrees with direction "34.013°N 118.285°W"
      const decimalWithDirectionPattern =
        /(\d+\.?\d*)°([NSEW])\s+(\d+\.?\d*)°([NSEW])/;
      const decimalWithDirectionMatch = strMap.match(
        decimalWithDirectionPattern,
      );

      if (decimalWithDirectionMatch && decimalWithDirectionMatch.length === 5) {
        let lat = parseFloat(decimalWithDirectionMatch[1]);
        const latDirection = decimalWithDirectionMatch[2].toUpperCase();
        let lon = parseFloat(decimalWithDirectionMatch[3]);
        const lonDirection = decimalWithDirectionMatch[4].toUpperCase();

        // Apply direction (South and West are negative)
        if (latDirection === 'S') lat = -lat;
        if (lonDirection === 'W') lon = -lon;

        // Validate coordinates
        if (
          !isNaN(lat) &&
          !isNaN(lon) &&
          lat >= -90 &&
          lat <= 90 &&
          lon >= -180 &&
          lon <= 180
        ) {
          console.log(
            `[COORDS] ✓ Format 3 (decimal with direction): lat=${lat}, lon=${lon}`,
          );
          return { lat, lon };
        }
      }

      // Try format 4: DMS with decimal MINUTES "29°45.132′N 95°21.144′W"
      // This format has degrees, decimal minutes, and direction (no seconds)
      const dmsDecimalMinutesPattern =
        /(\d+)°(\d+\.?\d*)′([NSEW])\s+(\d+)°(\d+\.?\d*)′([NSEW])/;
      const dmsDecimalMinutesMatch = strMap.match(dmsDecimalMinutesPattern);

      if (dmsDecimalMinutesMatch && dmsDecimalMinutesMatch.length === 7) {
        const latDegrees = parseInt(dmsDecimalMinutesMatch[1], 10);
        const latMinutes = parseFloat(dmsDecimalMinutesMatch[2]);
        const latDirection = dmsDecimalMinutesMatch[3].toUpperCase();

        const lonDegrees = parseInt(dmsDecimalMinutesMatch[4], 10);
        const lonMinutes = parseFloat(dmsDecimalMinutesMatch[5]);
        const lonDirection = dmsDecimalMinutesMatch[6].toUpperCase();

        // Convert DM to decimal degrees (no seconds)
        let latDecimal = latDegrees + latMinutes / 60;
        let lonDecimal = lonDegrees + lonMinutes / 60;

        // Apply direction (South and West are negative)
        if (latDirection === 'S') latDecimal = -latDecimal;
        if (lonDirection === 'W') lonDecimal = -lonDecimal;

        // Validate coordinates
        if (
          !isNaN(latDecimal) &&
          !isNaN(lonDecimal) &&
          latDecimal >= -90 &&
          latDecimal <= 90 &&
          lonDecimal >= -180 &&
          lonDecimal <= 180
        ) {
          console.log(
            `[COORDS] ✓ Format 4 (DMS decimal minutes): lat=${latDecimal}, lon=${lonDecimal}`,
          );
          return { lat: latDecimal, lon: lonDecimal };
        }
      }

      // Try format 5: DMS format "39°28′29″N 0°21′30″W" (Degrees Minutes Seconds - integer seconds)
      const dmsPattern =
        /(\d+)°(\d+)′(\d+)″([NSEW])\s+(\d+)°(\d+)′(\d+)″([NSEW])/;
      const dmsMatch = strMap.match(dmsPattern);

      if (dmsMatch && dmsMatch.length === 9) {
        // Extract latitude components
        const latDegrees = parseInt(dmsMatch[1], 10);
        const latMinutes = parseInt(dmsMatch[2], 10);
        const latSeconds = parseInt(dmsMatch[3], 10);
        const latDirection = dmsMatch[4].toUpperCase();

        // Extract longitude components
        const lonDegrees = parseInt(dmsMatch[5], 10);
        const lonMinutes = parseInt(dmsMatch[6], 10);
        const lonSeconds = parseInt(dmsMatch[7], 10);
        const lonDirection = dmsMatch[8].toUpperCase();

        // Convert DMS to decimal degrees
        // Decimal = degrees + (minutes/60) + (seconds/3600)
        let latDecimal = latDegrees + latMinutes / 60 + latSeconds / 3600;
        let lonDecimal = lonDegrees + lonMinutes / 60 + lonSeconds / 3600;

        // Apply direction (South and West are negative)
        if (latDirection === 'S') latDecimal = -latDecimal;
        if (lonDirection === 'W') lonDecimal = -lonDecimal;

        // Validate coordinates
        if (
          !isNaN(latDecimal) &&
          !isNaN(lonDecimal) &&
          latDecimal >= -90 &&
          latDecimal <= 90 &&
          lonDecimal >= -180 &&
          lonDecimal <= 180
        ) {
          console.log(
            `[COORDS] ✓ Format 5 (DMS integer seconds): lat=${latDecimal}, lon=${lonDecimal}`,
          );
          return {
            lat: latDecimal,
            lon: lonDecimal,
          };
        }
      }

      // Try format 6: DMS with decimal seconds "39°58′6.46″N 83°1′1.52″W"
      const dmsDecimalSecondsPattern =
        /(\d+)°(\d+)′(\d+\.?\d*)″([NSEW])\s+(\d+)°(\d+)′(\d+\.?\d*)″([NSEW])/;
      const dmsDecimalSecondsMatch = strMap.match(dmsDecimalSecondsPattern);

      if (dmsDecimalSecondsMatch && dmsDecimalSecondsMatch.length === 9) {
        // Extract latitude components
        const latDegrees = parseInt(dmsDecimalSecondsMatch[1], 10);
        const latMinutes = parseInt(dmsDecimalSecondsMatch[2], 10);
        const latSeconds = parseFloat(dmsDecimalSecondsMatch[3]); // Use parseFloat for decimal seconds
        const latDirection = dmsDecimalSecondsMatch[4].toUpperCase();

        // Extract longitude components
        const lonDegrees = parseInt(dmsDecimalSecondsMatch[5], 10);
        const lonMinutes = parseInt(dmsDecimalSecondsMatch[6], 10);
        const lonSeconds = parseFloat(dmsDecimalSecondsMatch[7]); // Use parseFloat for decimal seconds
        const lonDirection = dmsDecimalSecondsMatch[8].toUpperCase();

        // Convert DMS to decimal degrees
        // Decimal = degrees + (minutes/60) + (seconds/3600)
        let latDecimal = latDegrees + latMinutes / 60 + latSeconds / 3600;
        let lonDecimal = lonDegrees + lonMinutes / 60 + lonSeconds / 3600;

        // Apply direction (South and West are negative)
        if (latDirection === 'S') latDecimal = -latDecimal;
        if (lonDirection === 'W') lonDecimal = -lonDecimal;

        // Validate coordinates
        if (
          !isNaN(latDecimal) &&
          !isNaN(lonDecimal) &&
          latDecimal >= -90 &&
          latDecimal <= 90 &&
          lonDecimal >= -180 &&
          lonDecimal <= 180
        ) {
          console.log(
            `[COORDS] ✓ Format 6 (DMS decimal seconds): lat=${latDecimal}, lon=${lonDecimal}`,
          );
          return {
            lat: latDecimal,
            lon: lonDecimal,
          };
        }
      }

      // If none of the formats matched
      return null;
    } catch (error) {
      console.error(
        `Error extracting coordinates from strMap: ${strMap}`,
        error,
      );
      return null;
    }
  }
}
