import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('PORT', 3000);

  // ─── Prefijo global de la API ──────────────────────────────
  app.setGlobalPrefix('api/v1');

  // ─── Validación estricta de DTOs ──────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,            // Elimina campos no declarados en el DTO
      forbidNonWhitelisted: true, // Lanza error si llegan campos extra
      transform: true,            // Convierte tipos automáticamente
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Filtro global de errores ──────────────────────────────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ─── Interceptor de respuesta estándar ────────────────────
  app.useGlobalInterceptors(new ResponseInterceptor());

  // ─── CORS ─────────────────────────────────────────────────
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3001')
    .split(',');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.listen(port);
  logger.log(`🚀 RégieArt API corriendo en: http://localhost:${port}/api/v1`);
  logger.log(`🌍 Entorno: ${configService.get('NODE_ENV', 'development')}`);
  logger.log(`🔐 Keycloak: ${configService.get('KEYCLOAK_URL')}/realms/${configService.get('KEYCLOAK_REALM')}`);
}

bootstrap();
