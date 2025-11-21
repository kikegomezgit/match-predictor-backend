import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  PredictionService,
  PredictionQuery,
} from './services/prediction.service';

export class PredictionRequestDto {
  leagueId?: string;
  season?: string;
  homeTeam?: string;
  awayTeam?: string;
  limit?: number;
  question: string;
}

export class MatchPredictionRequestDto {
  matches: any[]; // Array of upcoming match objects with all their data
  question: string; // Required: Your question about the match prediction
  limit?: number; // Optional limit for historical matches
  conversationId?: string; // Optional: Conversation ID for follow-up questions
}

@Controller('prediction')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Post('ask')
  async askPrediction(@Body() dto: PredictionRequestDto) {
    const { leagueId, season, homeTeam, awayTeam, limit, question } = dto;

    // Validate question
    if (!question || question.trim().length === 0) {
      throw new HttpException('Question is required', HttpStatus.BAD_REQUEST);
    }

    // Validate leagueId if provided
    if (leagueId && leagueId !== '4335' && leagueId !== '4346') {
      throw new HttpException(
        'Invalid leagueId. Only 4335 (La Liga) and 4346 (MLS) are allowed.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate limit if provided
    if (limit !== undefined && (limit < 1 || limit > 500)) {
      throw new HttpException(
        'limit must be between 1 and 500',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const query: PredictionQuery = {
        leagueId,
        season,
        homeTeam,
        awayTeam,
        limit,
        question: question.trim(),
      };

      const result = await this.predictionService.getPrediction(query);

      return {
        success: true,
        data: {
          answer: result.answer,
          matchesUsed: result.matchesUsed,
          cached: result.cached,
          query: {
            leagueId: query.leagueId || 'all',
            season: query.season || 'all',
            homeTeam: query.homeTeam || 'all',
            awayTeam: query.awayTeam || 'all',
            limit: query.limit || 150,
          },
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get prediction',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('predict-match')
  async predictMatch(@Body() dto: MatchPredictionRequestDto) {
    const { matches, question, limit } = dto;

    // Validate matches array
    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      throw new HttpException(
        'Matches array is required and must contain at least one match',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate required match fields for each match
    for (const match of matches) {
      if (!match.idLeague || !match.strHomeTeam || !match.strAwayTeam) {
        throw new HttpException(
          'Each match object must include idLeague, strHomeTeam, and strAwayTeam',
          HttpStatus.BAD_REQUEST,
        );
      }

      // Validate leagueId
      if (match.idLeague !== '4335' && match.idLeague !== '4346') {
        throw new HttpException(
          'Invalid leagueId. Only 4335 (La Liga) and 4346 (MLS) are allowed.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Validate question
    if (!question || question.trim().length === 0) {
      throw new HttpException(
        'Question is required. You can ask anything about the match prediction, historical data, weather impact, team performance, etc.',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Validate limit if provided
    if (limit !== undefined && (limit < 1 || limit > 500)) {
      throw new HttpException(
        'limit must be between 1 and 500',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.predictionService.predictMatchOutcome(
        matches,
        question.trim(),
        limit,
        dto.conversationId, // Pass conversationId if provided
      );

      return {
        success: true,
        data: {
          answer: result.answer,
          matchesUsed: result.matchesUsed,
          cached: result.cached,
          conversationId: result.conversationId, // Return conversationId for follow-ups
          upcomingMatches: matches.map((match) => ({
            homeTeam: match.strHomeTeam,
            awayTeam: match.strAwayTeam,
            venue: match.strVenue,
            date: match.dateEvent,
            weather: match.weatherAtMatchTime,
          })),
        },
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to get prediction',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('conversation/:conversationId')
  async getConversation(@Param('conversationId') conversationId: string) {
    try {
      const conversation =
        await this.predictionService.getConversation(conversationId);

      if (!conversation) {
        throw new HttpException(
          'Conversation not found or expired',
          HttpStatus.NOT_FOUND,
        );
      }

      return {
        success: true,
        data: {
          conversationId: conversation.conversationId,
          matches: conversation.matches,
          messagesCount: conversation.messages.length,
          matchesUsed: conversation.matchesUsed,
          createdAt: conversation.createdAt,
          lastActivity: conversation.lastActivity,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || 'Failed to get conversation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Delete('conversation/:conversationId')
  async deleteConversation(@Param('conversationId') conversationId: string) {
    try {
      await this.predictionService.deleteConversation(conversationId);
      return {
        success: true,
        message: 'Conversation deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Failed to delete conversation',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
