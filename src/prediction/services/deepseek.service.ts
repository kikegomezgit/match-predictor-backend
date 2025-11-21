import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class DeepSeekService {
  private readonly logger = new Logger(DeepSeekService.name);
  private readonly openai: OpenAI;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('DEEPSEEK_API_KEY') || '';
    if (!this.apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY is not set in environment variables.');
    }

    // Initialize OpenAI client pointing to DeepSeek's API
    // DeepSeek's API is compatible with OpenAI's API structure
    this.openai = new OpenAI({
      apiKey: this.apiKey,
      baseURL: 'https://api.deepseek.com/v1', // DeepSeek's endpoint
      timeout: 60000, // 60 seconds timeout for AI responses
    });

    this.logger.log('DeepSeekService initialized with OpenAI SDK');
  }

  /**
   * Gets the system prompt for sports analysis
   */
  private getSystemPrompt(): string {
    return `Hey! You're a friendly soccer expert who loves talking about match predictions and analysis. 
You're chatting with someone who wants insights about upcoming matches.

The user will provide upcoming match(es) and historical match data. Your job is to analyze this information and answer their question in a friendly, conversational way.

Here's how to chat:
- Be friendly and casual, like you're talking to a friend about soccer
- Answer naturally and directly - don't mention that you received data or were "fed" information
- Don't use phrases like "according to the data you gave me" or "based on the data provided"
- Just answer as if you naturally know about these matches and teams
- Look for patterns in the historical matches
- Talk about how weather might affect the games
- Mention specific examples from matches when relevant
- Give your thoughts and predictions naturally
- Be helpful and specific, but keep it conversational
- If they ask for predictions, give your best guess with reasoning
- Answer their question directly without referencing that you received data`;
  }

  /**
   * Sends a prompt to DeepSeek API with context
   */
  async askQuestion(context: string, userQuestion: string): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const systemPrompt = this.getSystemPrompt();
    const userMessage = `${context}\n\nQuestion: ${userQuestion}`;

    try {
      this.logger.log(
        `[DEEPSEEK] Sending request with context length: ${context.length} characters, question length: ${userQuestion.length} characters`,
      );
      this.logger.debug(
        `[DEEPSEEK] Context preview (first 500 chars): ${context.substring(0, 500)}...`,
      );

      const completion = await this.openai.chat.completions.create({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      });

      const answer = completion.choices[0]?.message?.content;
      if (!answer) {
        throw new Error('No response from DeepSeek API');
      }

      this.logger.log(
        `[DEEPSEEK] ✓ Received response (${answer.length} characters)`,
      );
      return answer;
    } catch (error: any) {
      this.logger.error(
        `[DEEPSEEK] ✗ Error calling DeepSeek API:`,
        error.message || error,
      );
      throw new Error(
        `DeepSeek API error: ${error.message || 'Unknown error'}`,
      );
    }
  }

  /**
   * Sends a prompt to DeepSeek API with conversation history
   * For follow-up questions in a conversation
   */
  async askQuestionWithHistory(
    context: string,
    userQuestion: string,
    conversationHistory?: Array<{ role: string; content: string }>,
  ): Promise<string> {
    if (!this.apiKey) {
      throw new Error('DEEPSEEK_API_KEY is not configured');
    }

    const systemPrompt = `${this.getSystemPrompt()}
- Feel free to reference what we talked about earlier in this conversation`;

    const messages: Array<
      { role: 'system' | 'user' | 'assistant'; content: string }
    > = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    if (conversationHistory && conversationHistory.length > 0) {
      // Existing conversation: add all previous messages
      // The first user message already contains the context
      messages.push(
        ...conversationHistory.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      );
      // Add only the new question (context already in history)
      messages.push({
        role: 'user',
        content: userQuestion,
      });
      this.logger.log(
        `[DEEPSEEK] Using conversation history with ${conversationHistory.length} previous messages`,
      );
    } else {
      // New conversation: send context + question
      messages.push({
        role: 'user',
        content: `${context}\n\nQuestion: ${userQuestion}`,
      });
      this.logger.log(
        `[DEEPSEEK] Starting new conversation with context length: ${context.length} characters`,
      );
    }

    try {
      this.logger.log(
        `[DEEPSEEK] Sending request with ${messages.length} messages, question length: ${userQuestion.length} characters`,
      );

      const completion = await this.openai.chat.completions.create({
        model: 'deepseek-chat',
        messages,
        temperature: 0.7,
        max_tokens: 2000,
      });

      const answer = completion.choices[0]?.message?.content;
      if (!answer) {
        throw new Error('No response from DeepSeek API');
      }

      this.logger.log(
        `[DEEPSEEK] ✓ Received response (${answer.length} characters)`,
      );
      return answer;
    } catch (error: any) {
      this.logger.error(
        `[DEEPSEEK] ✗ Error calling DeepSeek API:`,
        error.message || error,
      );
      throw new Error(
        `DeepSeek API error: ${error.message || 'Unknown error'}`,
      );
    }
  }
}
