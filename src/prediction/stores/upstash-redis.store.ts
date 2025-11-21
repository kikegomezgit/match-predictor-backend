import { Redis } from '@upstash/redis';
import { Logger } from '@nestjs/common';

export interface UpstashRedisStoreOptions {
  url: string;
  token: string;
  ttl?: number;
}

export class UpstashRedisStore {
  private redis: Redis;
  private defaultTtl: number;
  private readonly logger = new Logger(UpstashRedisStore.name);

  constructor(options: UpstashRedisStoreOptions) {
    this.redis = new Redis({
      url: options.url,
      token: options.token,
    });
    this.defaultTtl = options.ttl || 3600; // Default 1 hour (in seconds)
    this.logger.log(
      `UpstashRedisStore initialized with URL: ${options.url.substring(0, 30)}...`,
    );
  }

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.redis.get<T>(key);
      if (value !== null) {
        this.logger.debug(`[CACHE HIT] Key: ${key}`);
      }
      return value ?? undefined;
    } catch (error) {
      this.logger.error(`[Upstash Redis] Error getting key ${key}:`, error);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      // cache-manager passes TTL in milliseconds, convert to seconds
      const expirationTime = ttl ? Math.floor(ttl / 1000) : this.defaultTtl;
      await this.redis.set(key, value, { ex: expirationTime });
      this.logger.debug(`[CACHE SET] Key: ${key}, TTL: ${expirationTime}s`);
    } catch (error) {
      this.logger.error(`[Upstash Redis] Error setting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`[CACHE DEL] Key: ${key}`);
    } catch (error) {
      this.logger.error(`[Upstash Redis] Error deleting key ${key}:`, error);
    }
  }

  async reset(): Promise<void> {
    // Upstash Redis doesn't support FLUSHALL via REST API
    // This would require admin access, so we'll log a warning
    this.logger.warn('[Upstash Redis] Reset not supported via REST API');
  }

  async keys(pattern?: string): Promise<string[]> {
    // Upstash Redis REST API doesn't support KEYS command
    // This is a limitation of REST API vs native Redis
    this.logger.warn(
      '[Upstash Redis] Keys pattern matching not supported via REST API',
    );
    return [];
  }

  async getTtl(key: string): Promise<number> {
    try {
      const ttlValue = await this.redis.ttl(key);
      return ttlValue > 0 ? ttlValue * 1000 : -1; // Convert seconds to milliseconds
    } catch (error) {
      this.logger.error(
        `[Upstash Redis] Error getting TTL for key ${key}:`,
        error,
      );
      return -1;
    }
  }
}
