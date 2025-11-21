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
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiOkResponse,
} from '@nestjs/swagger';
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

@ApiTags('prediction')
@Controller('prediction')
export class PredictionController {
  constructor(private readonly predictionService: PredictionService) {}

  @Post('ask')
  @ApiOperation({
    summary: 'Ask a prediction question',
    description:
      'Ask any question about match predictions using historical data. Supports filtering by league, season, teams, etc.',
  })
  @ApiBody({
    description: 'Prediction query with question and optional filters',
    schema: {
      type: 'object',
      required: ['question'],
      properties: {
        question: {
          type: 'string',
          description: 'Your question about match predictions',
          example: 'What is the probability of a home win?',
        },
        leagueId: {
          type: 'string',
          description: 'League ID (4335 for La Liga, 4346 for MLS)',
          example: '4335',
        },
        season: { type: 'string', description: 'Season filter', example: '2023-24' },
        homeTeam: { type: 'string', description: 'Home team filter', example: 'Barcelona' },
        awayTeam: { type: 'string', description: 'Away team filter', example: 'Real Madrid' },
        limit: {
          type: 'number',
          description: 'Limit number of historical matches (1-500)',
          example: 150,
          minimum: 1,
          maximum: 500,
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Prediction answer with matches used',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            matchesUsed: { type: 'number' },
            cached: { type: 'boolean' },
            query: { type: 'object' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
  @ApiOperation({
    summary: 'Predict match outcome',
    description:
      'Get AI-powered predictions for upcoming matches. Provide match data and ask questions about outcomes, weather impact, team performance, etc.',
  })
  @ApiBody({
    description: 'Match prediction request with upcoming matches and question',
    schema: {
      type: 'object',
      required: ['matches', 'question'],
      properties: {
        matches: {
          type: 'array',
          description: 'Array of upcoming match objects',
          items: {
            type: 'object',
            required: ['idLeague', 'strHomeTeam', 'strAwayTeam'],
            properties: {
              idLeague: { type: 'string', example: '4335' },
              strHomeTeam: { type: 'string', example: 'Barcelona' },
              strAwayTeam: { type: 'string', example: 'Real Madrid' },
              strVenue: { type: 'string', example: 'Camp Nou' },
              dateEvent: { type: 'string', example: '2024-01-15' },
            },
          },
        },
        question: {
          type: 'string',
          description: 'Your question about the match prediction',
          example: 'What is the predicted outcome considering weather conditions?',
        },
        limit: {
          type: 'number',
          description: 'Limit number of historical matches (1-500)',
          example: 150,
          minimum: 1,
          maximum: 500,
        },
        conversationId: {
          type: 'string',
          description: 'Conversation ID for follow-up questions',
          example: 'conv_123456',
        },
      },
    },
  })
  @ApiOkResponse({
    description: 'Match prediction with answer and conversation ID',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            answer: { type: 'string' },
            matchesUsed: { type: 'number' },
            cached: { type: 'boolean' },
            conversationId: { type: 'string' },
            upcomingMatches: { type: 'array' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
  @ApiOperation({
    summary: 'Get conversation details',
    description: 'Retrieve details of a prediction conversation by ID',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID',
    example: 'conv_123456',
  })
  @ApiOkResponse({
    description: 'Conversation details',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            conversationId: { type: 'string' },
            matches: { type: 'array' },
            messagesCount: { type: 'number' },
            matchesUsed: { type: 'number' },
            createdAt: { type: 'string' },
            lastActivity: { type: 'string' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Conversation not found' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
  @ApiOperation({
    summary: 'Delete conversation',
    description: 'Delete a prediction conversation by ID',
  })
  @ApiParam({
    name: 'conversationId',
    description: 'Conversation ID to delete',
    example: 'conv_123456',
  })
  @ApiOkResponse({
    description: 'Conversation deleted successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 500, description: 'Internal server error' })
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
