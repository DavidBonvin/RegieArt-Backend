import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const redisUrl = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      // Fail commands immediately when Redis is offline instead of queuing them.
      // Without this, commands queue indefinitely causing 30-60s response hangs.
      enableOfflineQueue: false,
      // Do not retry individual commands — let callers handle failures.
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      connectTimeout: 3000,
      // Limit reconnection attempts to avoid hammering an unreachable server.
      retryStrategy: (times: number) => {
        if (times > 10) return null; // stop retrying after 10 attempts
        return Math.min(times * 500, 5000); // exponential back-off, max 5s
      },
    });

    // Required: prevents Node.js from throwing unhandled 'error' events
    // when Redis emits connection errors (e.g. ECONNREFUSED).
    this.client.on('error', (err: Error) => {
      this.logger.warn(`Redis connection error (non-fatal): ${err.message}`);
    });
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  getClient(): Redis {
    return this.client;
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
