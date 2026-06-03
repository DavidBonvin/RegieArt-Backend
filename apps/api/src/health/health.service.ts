import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async getDetailedHealth() {
    const [dbResult, redisResult] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const database =
      dbResult.status === 'fulfilled'
        ? dbResult.value
        : { status: 'down' as const, error: 'Connection failed' };

    const redis =
      redisResult.status === 'fulfilled'
        ? redisResult.value
        : { status: 'down' as const, error: 'Connection failed' };

    const overall = database.status === 'up' && redis.status === 'up' ? 'ok' : 'degraded';

    return {
      status: overall,
      timestamp: new Date().toISOString(),
      services: { database, redis },
    };
  }

  private async checkDatabase() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'up' as const, latency: `${Date.now() - start}ms` };
  }

  private async checkRedis() {
    const start = Date.now();
    const reply = await this.redis.ping();
    if (reply !== 'PONG') throw new Error('Unexpected ping reply');
    return { status: 'up' as const, latency: `${Date.now() - start}ms` };
  }
}
