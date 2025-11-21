import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class SportsService {
  private readonly logger = new Logger(SportsService.name);
  private readonly axiosInstance: AxiosInstance;
  private readonly baseUrl = 'https://www.thesportsdb.com/api/v1/json/123/';

  // Rate limiting: 28 requests per minute
  private readonly RATE_LIMIT = 28;
  private readonly WAIT_TIME_MS = 60000; // 60 seconds wait after 28 calls
  private apiCallCount = 0;

  constructor() {
    this.axiosInstance = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
    this.logger.log(
      `SportsService initialized. Rate limit: ${this.RATE_LIMIT} requests, then wait ${this.WAIT_TIME_MS / 1000} seconds`,
    );
  }

  /**
   * Checks if rate limit is reached and waits if necessary
   * Every 28 API calls, wait 60 seconds then reset counter
   */
  private async checkRateLimit(): Promise<void> {
    // If we've reached the limit, wait 60 seconds then reset
    if (this.apiCallCount >= this.RATE_LIMIT) {
      this.logger.warn(
        `[RATE LIMIT] Reached ${this.RATE_LIMIT} requests. Waiting ${this.WAIT_TIME_MS / 1000} seconds before continuing...`,
      );
      await this.sleep(this.WAIT_TIME_MS);
      // Reset after waiting
      this.apiCallCount = 0;
      this.logger.log(
        `[RATE LIMIT] Wait complete. Counter reset. Resuming API calls...`,
      );
    }
  }

  /**
   * Helper method to sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getMatchesBySeason(leagueId: number, season: string): Promise<any[]> {
    // Check rate limit before making API call
    await this.checkRateLimit();

    this.apiCallCount++;
    this.logger.log(
      `[API CALL #${this.apiCallCount}] Fetching matches for league ${leagueId}, season ${season}`,
    );

    try {
      const response = await this.axiosInstance.get('eventsseason.php', {
        params: {
          id: leagueId,
          s: season,
        },
      });

      if (response.data && response.data.events) {
        this.logger.log(
          `[API CALL #${this.apiCallCount}] ✓ Retrieved ${response.data.events.length} matches`,
        );
        return response.data.events;
      }
      return [];
    } catch (error) {
      this.logger.error(
        `[API CALL #${this.apiCallCount}] ✗ Error fetching matches for league ${leagueId}, season ${season}:`,
        error.message,
      );
      throw error;
    }
  }

  async searchVenue(venueName: string): Promise<any> {
    // Check rate limit before making API call
    await this.checkRateLimit();

    this.apiCallCount++;
    this.logger.log(
      `[API CALL #${this.apiCallCount}] Searching venue: ${venueName}`,
    );

    try {
      const response = await this.axiosInstance.get('searchvenues.php', {
        params: {
          v: venueName,
        },
      });

      if (
        response.data &&
        response.data.venues &&
        response.data.venues.length > 0
      ) {
        this.logger.log(
          `[API CALL #${this.apiCallCount}] ✓ Found venue ${venueName}: ${response.data.venues[0].strMap || 'no coordinates'}`,
        );
        return response.data.venues[0];
      }
      this.logger.warn(
        `[API CALL #${this.apiCallCount}] ✗ Venue not found: ${venueName}`,
      );
      return null;
    } catch (error) {
      this.logger.error(
        `[API CALL #${this.apiCallCount}] ✗ Error searching venue ${venueName}:`,
        error.message,
      );
      return null;
    }
  }

  async getUpcomingMatches(leagueId: number): Promise<any[]> {
    // Check rate limit before making API call
    await this.checkRateLimit();

    this.apiCallCount++;
    this.logger.log(
      `[API CALL #${this.apiCallCount}] Fetching upcoming matches for league ${leagueId}`,
    );

    try {
      const response = await this.axiosInstance.get('eventsnextleague.php', {
        params: {
          id: leagueId,
        },
      });

      if (response.data && response.data.events) {
        this.logger.log(
          `[API CALL #${this.apiCallCount}] ✓ Retrieved ${response.data.events.length} upcoming matches`,
        );
        return response.data.events;
      }
      return [];
    } catch (error) {
      this.logger.error(
        `[API CALL #${this.apiCallCount}] ✗ Error fetching upcoming matches for league ${leagueId}:`,
        error.message,
      );
      throw error;
    }
  }

  /**
   * Get current API call count in the current window
   */
  getApiCallCount(): number {
    return this.apiCallCount;
  }

  /**
   * Reset the API call counter (useful for testing or manual reset)
   */
  resetCounter(): void {
    const previousCount = this.apiCallCount;
    this.apiCallCount = 0;
    this.logger.log(
      `[RATE LIMIT] Counter manually reset. Previous count: ${previousCount}`,
    );
  }
}
