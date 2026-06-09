import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthService } from './health.service';

// El health check es consultado constantemente por Railway y monitores externos.
// Excluirlo del rate limiting evita que esas llamadas automáticas consuman el cupo.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('detailed')
  checkDetailed() {
    return this.healthService.getDetailedHealth();
  }
}
