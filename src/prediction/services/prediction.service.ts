import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Match, MatchDocument } from '../../database/schemas/match.schema';
import { DeepSeekService } from './deepseek.service';

export interface PredictionQuery {
  leagueId?: string;
  season?: string;
  homeTeam?: string;
  awayTeam?: string;
  limit?: number;
  question: string;
}

export interface ConversationData {
  conversationId: string;
  matches: Array<{
    idEvent: string;
    idLeague: string;
    strHomeTeam: string;
    strAwayTeam: string;
    dateEvent: string;
  }>;
  context: string; // Full context string (upcoming matches + historical matches)
  messages: Array<{ role: string; content: string }>;
  matchesUsed: number;
  createdAt: string;
  lastActivity: string;
}

@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private readonly CACHE_TTL = 3600; // 1 hour cache TTL
  private readonly DEFAULT_MATCH_LIMIT = 150; // Default number of matches to include in context

  constructor(
    @InjectModel(Match.name) private matchModel: Model<MatchDocument>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private deepSeekService: DeepSeekService,
  ) {
    this.logger.log('PredictionService initialized');
  }

  /**
   * Formats a match for context (only relevant fields)
   */
  private formatMatchForContext(match: Match): string {
    const weather = match.weatherAtMatchTime || {};
    return `Match: ${match.strHomeTeam} vs ${match.strAwayTeam}
Date: ${match.dateEvent} ${match.strTime || ''}
Venue: ${match.strVenue}, ${match.strCountry}
Score: ${match.intHomeScore || 'N/A'} - ${match.intAwayScore || 'N/A'}
Status: ${match.strStatus}
Weather: ${weather.weather || 'N/A'} (${weather.temperature || 'N/A'}°C), Humidity: ${weather.humidity || 'N/A'}%, Wind: ${weather.windSpeed || 'N/A'} m/s
---`;
  }

  /**
   * Formats an upcoming match for context (more detailed)
   */
  private formatUpcomingMatchForContext(match: any): string {
    const weather = match.weatherAtMatchTime || {};
    return `UPCOMING MATCH TO PREDICT:
Home Team: ${match.strHomeTeam}
Away Team: ${match.strAwayTeam}
Date: ${match.dateEvent} ${match.strTime || ''}
Venue: ${match.strVenue}, ${match.strCountry}${match.strCity ? `, ${match.strCity}` : ''}
League: ${match.strLeague} (Season: ${match.strSeason})
Status: ${match.strStatus}
Weather Forecast: ${weather.weather || 'N/A'} (${weather.temperature || 'N/A'}°C), Humidity: ${weather.humidity || 'N/A'}%, Wind: ${weather.windSpeed || 'N/A'} m/s, Pressure: ${weather.pressure || 'N/A'} hPa
Weather Description: ${weather.weatherDescription || 'N/A'}
---`;
  }

  /**
   * Formats multiple upcoming matches for context
   */
  private formatUpcomingMatchesForContext(matches: any[]): string {
    if (matches.length === 1) {
      return this.formatUpcomingMatchForContext(matches[0]);
    }

    const matchesList = matches
      .map((match, index) => {
        const weather = match.weatherAtMatchTime || {};
        return `MATCH ${index + 1}:
Home Team: ${match.strHomeTeam}
Away Team: ${match.strAwayTeam}
Date: ${match.dateEvent} ${match.strTime || ''}
Venue: ${match.strVenue}, ${match.strCountry}
League: ${match.strLeague} (Season: ${match.strSeason})
Weather Forecast: ${weather.weather || 'N/A'} (${weather.temperature || 'N/A'}°C)`;
      })
      .join('\n\n');

    return `UPCOMING MATCHES TO PREDICT (${matches.length} matches):\n\n${matchesList}\n---`;
  }

  /**
   * Generates a cache key based on query parameters
   */
  private generateCacheKey(query: PredictionQuery): string {
    const parts = [
      'prediction',
      query.leagueId || 'all',
      query.season || 'all',
      query.homeTeam || 'all',
      query.awayTeam || 'all',
      query.limit || this.DEFAULT_MATCH_LIMIT,
      // Hash the question to keep cache key reasonable length
      Buffer.from(query.question).toString('base64').substring(0, 20),
    ];
    return parts.join(':');
  }

  /**
   * Fetches matches from database with filters
   */
  private async fetchMatches(query: PredictionQuery): Promise<Match[]> {
    const filter: any = {};

    // Filter by league
    if (query.leagueId) {
      filter.idLeague = query.leagueId;
    }

    // Filter by season
    if (query.season) {
      filter.strSeason = query.season;
    }

    // Filter by teams (if specified, include matches where either team matches)
    if (query.homeTeam || query.awayTeam) {
      filter.$or = [];
      if (query.homeTeam) {
        filter.$or.push(
          { strHomeTeam: { $regex: query.homeTeam, $options: 'i' } },
          { strAwayTeam: { $regex: query.homeTeam, $options: 'i' } },
        );
      }
      if (query.awayTeam) {
        filter.$or.push(
          { strHomeTeam: { $regex: query.awayTeam, $options: 'i' } },
          { strAwayTeam: { $regex: query.awayTeam, $options: 'i' } },
        );
      }
    }

    // Use a high limit to fetch all matches (or use provided limit)
    const limit = query.limit || 10000; // High limit to get all matches

    this.logger.log(
      `[PREDICTION] Fetching matches with filter: ${JSON.stringify(filter)}, limit: ${limit}`,
    );

    const matches = await this.matchModel
      .find(filter)
      .sort({ dateEvent: -1, strTimestamp: -1 }) // Most recent first
      .limit(limit)
      .lean<Match[]>()
      .exec();

    this.logger.log(`[PREDICTION] Found ${matches.length} matches`);

    return matches;
  }

  /**
   * Builds context string from matches
   */
  private buildContext(matches: Match[]): string {
    if (matches.length === 0) {
      return 'No historical match data available.';
    }

    const contextParts = [
      `Historical Match Data (${matches.length} matches):`,
      '',
      ...matches.map((match) => this.formatMatchForContext(match)),
    ];

    return contextParts.join('\n');
  }

  /**
   * Gets prediction from DeepSeek with caching
   */
  async getPrediction(query: PredictionQuery): Promise<{
    answer: string;
    matchesUsed: number;
    cached: boolean;
  }> {
    const cacheKey = this.generateCacheKey(query);

    // Try to get from cache
    const cachedResult = await this.cacheManager.get<{
      answer: string;
      matchesUsed: number;
    }>(cacheKey);

    if (cachedResult) {
      this.logger.log(`[PREDICTION] Cache hit for key: ${cacheKey}`);
      return {
        ...cachedResult,
        cached: true,
      };
    }

    this.logger.log(
      `[PREDICTION] Cache miss, fetching matches and calling DeepSeek`,
    );

    // Fetch matches from database
    const matches = await this.fetchMatches(query);

    if (matches.length === 0) {
      throw new Error(
        'No matches found with weather data matching the specified criteria.',
      );
    }

    // Build context
    const context = this.buildContext(matches);

    // Call DeepSeek API (context and question are combined in the service)
    const answer = await this.deepSeekService.askQuestion(
      context,
      query.question,
    );

    const result = {
      answer,
      matchesUsed: matches.length,
      cached: false,
    };

    // Cache the result
    await this.cacheManager.set(
      cacheKey,
      {
        answer,
        matchesUsed: matches.length,
      },
      this.CACHE_TTL * 1000,
    ); // Cache TTL in milliseconds

    this.logger.log(
      `[PREDICTION] ✓ Prediction generated and cached for ${this.CACHE_TTL}s`,
    );

    return result;
  }

  /**
   * Predicts outcome for upcoming matches based on historical data
   * Supports conversation history - context is sent once, follow-up questions reuse it
   * If matches change (different league/match), context is regenerated
   */
  async predictMatchOutcome(
    upcomingMatches: any[],
    question: string,
    limit?: number,
    conversationId?: string,
  ): Promise<{
    answer: string;
    matchesUsed: number;
    cached: boolean;
    conversationId: string;
  }> {
    // Extract filters from upcoming matches (use first match for league context)
    const firstMatch = upcomingMatches[0];
    const leagueId = firstMatch.idLeague?.toString();
    const matchIds = upcomingMatches.map((m) => m.idEvent).join(',');
    const matchesKey = upcomingMatches
      .map((m) => `${m.strHomeTeam} vs ${m.strAwayTeam}`)
      .join(' | ');

    let conversation: ConversationData | null = null;
    let isNewConversation = false;
    let needsNewContext = false;

    // If conversationId provided, retrieve existing conversation
    if (conversationId) {
      conversation = await this.cacheManager.get<ConversationData>(
        `conversation:${conversationId}`,
      );

      if (!conversation) {
        this.logger.warn(
          `[PREDICTION] Conversation ${conversationId} not found, starting new conversation`,
        );
        conversationId = undefined; // Will create new conversation
      } else {
        // Check if matches have changed (different league or different matches)
        const previousMatchIds = conversation.matches
          .map((m) => m.idEvent)
          .join(',');
        const previousLeagueId = conversation.matches[0]?.idLeague;
        const matchChanged =
          previousLeagueId !== leagueId || previousMatchIds !== matchIds;

        if (matchChanged) {
          this.logger.log(
            `[PREDICTION] Matches changed (league: ${previousLeagueId} → ${leagueId}). Regenerating context.`,
          );
          needsNewContext = true;
          // Keep conversationId but regenerate context
        } else {
          this.logger.log(
            `[PREDICTION] Using existing conversation ${conversationId} for matches ${matchIds}`,
          );
        }
      }
    }

    // New conversation or match changed: fetch context
    if (!conversation || needsNewContext) {
      isNewConversation = !conversation;
      if (!conversationId) {
        conversationId = `conv_${Date.now()}_${Math.random()
          .toString(36)
          .substr(2, 9)}`;
      }

      this.logger.log(
        `[PREDICTION] ${isNewConversation ? 'Starting new' : 'Regenerating'} conversation ${conversationId} for ${matchesKey}`,
      );

      // Fetch ALL matches from database (no league filter) for comprehensive context
      const allMatchesQuery: PredictionQuery = {
        // No leagueId - fetch all matches
        // Use high limit or provided limit to get all matches
        limit: limit || 10000,
        question: '',
      };

      // Fetch all matches (not filtered by league or teams)
      const fetchStartTime = Date.now();
      const allMatches = await this.fetchMatches(allMatchesQuery);
      const fetchDuration = Date.now() - fetchStartTime;
      console.log(
        `[PREDICTION] ✅ Fetched ${allMatches.length} matches from database in ${fetchDuration}ms`,
      );

      if (allMatches.length === 0) {
        throw new Error(
          `No historical matches found in database. Please sync matches first.`,
        );
      }

      this.logger.log(
        `[PREDICTION] Fetched ${allMatches.length} matches from database for context`,
      );

      // Format upcoming matches
      const upcomingMatchesContext =
        this.formatUpcomingMatchesForContext(upcomingMatches);

      // Build context with all matches
      const historicalContext = this.buildContext(allMatches);
      const fullContext = `${upcomingMatchesContext}\n\n${historicalContext}`;

      console.log(
        `[PREDICTION] 📝 Context built: ${fullContext.length} characters (Upcoming: ${upcomingMatchesContext.length} chars, Historical: ${historicalContext.length} chars)`,
      );
      this.logger.log(
        `[PREDICTION] Context built: ${fullContext.length} characters (Upcoming matches: ${upcomingMatchesContext.length} chars, Historical: ${historicalContext.length} chars)`,
      );

      // Initialize or update conversation
      if (isNewConversation) {
        conversation = {
          conversationId,
          matches: upcomingMatches.map((match) => ({
            idEvent: match.idEvent,
            idLeague: match.idLeague?.toString(),
            strHomeTeam: match.strHomeTeam,
            strAwayTeam: match.strAwayTeam,
            dateEvent: match.dateEvent,
          })),
          context: fullContext,
          messages: [],
          matchesUsed: allMatches.length,
          createdAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        };
      } else {
        // Update existing conversation with new context
        conversation.context = fullContext;
        conversation.matches = upcomingMatches.map((match) => ({
          idEvent: match.idEvent,
          idLeague: match.idLeague?.toString(),
          strHomeTeam: match.strHomeTeam,
          strAwayTeam: match.strAwayTeam,
          dateEvent: match.dateEvent,
        }));
        conversation.matchesUsed = allMatches.length;
        // Clear previous messages since context changed
        conversation.messages = [];
        this.logger.log(
          `[PREDICTION] Cleared previous messages due to matches change`,
        );
      }
    }

    // Call DeepSeek API with conversation history
    if (conversation.messages.length > 0) {
      console.log(
        `[PREDICTION] 💬 Using conversation history (${conversation.messages.length} previous messages) - sending ONLY the new question to DeepSeek`,
      );
    } else {
      console.log(
        `[PREDICTION] 📤 First message - sending FULL context + question to DeepSeek`,
      );
    }

    const answer = await this.deepSeekService.askQuestionWithHistory(
      conversation.context,
      question,
      conversation.messages.length > 0 ? conversation.messages : undefined,
    );

    // Update conversation history
    if (conversation.messages.length === 0) {
      // First message: context + question
      conversation.messages.push({
        role: 'user',
        content: `${conversation.context}\n\nQuestion: ${question}`,
      });
    } else {
      // Subsequent message: only question
      conversation.messages.push({
        role: 'user',
        content: question,
      });
    }

    // Add assistant response
    conversation.messages.push({
      role: 'assistant',
      content: answer,
    });

    conversation.lastActivity = new Date().toISOString();

    // Store conversation in Redis (24 hour TTL)
    await this.cacheManager.set(
      `conversation:${conversationId}`,
      conversation,
      86400000, // 24 hours
    );

    console.log(
      `[PREDICTION] ✅ Prediction complete! Conversation ${conversationId} now has ${conversation.messages.length} messages`,
    );
    console.log(`[PREDICTION] 💾 Conversation saved to Redis (24h TTL)`);
    this.logger.log(
      `[PREDICTION] ✓ Match prediction generated. Conversation ${conversationId} has ${conversation.messages.length} messages`,
    );

    return {
      answer,
      matchesUsed: conversation.matchesUsed,
      cached: false,
      conversationId,
    };
  }

  /**
   * Gets conversation details by ID
   */
  async getConversation(
    conversationId: string,
  ): Promise<ConversationData | null> {
    const conversation = await this.cacheManager.get<ConversationData>(
      `conversation:${conversationId}`,
    );
    return conversation;
  }

  /**
   * Deletes a conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await this.cacheManager.del(`conversation:${conversationId}`);
    this.logger.log(`[PREDICTION] Deleted conversation ${conversationId}`);
  }

  /**
   * Invalidates cache for a specific league/season
   * Call this when new matches are synced
   */
  async invalidateCache(leagueId?: string, season?: string): Promise<void> {
    // Note: This is a simple implementation. For production, consider using
    // Redis pattern matching to invalidate specific keys
    this.logger.log(
      `[PREDICTION] Cache invalidation requested for league: ${leagueId}, season: ${season}`,
    );
    // In a production system, you'd want to invalidate specific patterns
    // For now, we rely on TTL expiration
  }
}
