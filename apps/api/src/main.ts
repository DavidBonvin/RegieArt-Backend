import './instrument';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
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
  const exactOrigins = configService
    .get<string>('CORS_ORIGINS', 'http://localhost:3001')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // *.vercel.app covers production + preview deployments; *.railway.app for internal services
  const wildcardPatterns = [
    /^https:\/\/[a-z0-9-]+\.vercel\.app$/,
    /^https:\/\/[a-z0-9-]+\.up\.railway\.app$/,
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (exactOrigins.includes(origin)) return callback(null, true);
      if (wildcardPatterns.some((re) => re.test(origin))) return callback(null, true);
      logger.warn(`CORS blocked: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port);
  logger.log(`🚀 RégieArt API corriendo en: http://localhost:${port}/api/v1`);
  logger.log(`🌍 Entorno: ${configService.get('NODE_ENV', 'development')}`);
  logger.log(`🔐 Keycloak: ${configService.get('KEYCLOAK_URL')}/realms/${configService.get('KEYCLOAK_REALM')}`);
}

bootstrap();
