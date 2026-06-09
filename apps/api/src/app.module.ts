import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { StorageModule } from './storage/storage.module';

@Module({
  imports: [
    // ─── Config global (variables de entorno disponibles en toda la app)
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),

    // ─── Prisma (ORM — acceso a la base de datos)
    PrismaModule,

    // ─── Redis (cache / rate-limiting)
    RedisModule,

    // ─── Rate limiting global con store Redis
    // El store Redis garantiza que los contadores sean compartidos
    // si Railway escala la API a múltiples instancias horizontalmente.
    // Límite por defecto: 60 peticiones por minuto por IP.
    // Los endpoints críticos (como presigned-upload) aplican su propio límite más estricto.
    ThrottlerModule.forRootAsync({
      inject: [RedisService],
      useFactory: (redisService: RedisService) => ({
        throttlers: [{ ttl: 60000, limit: 60 }],
        storage: new ThrottlerStorageRedisService(redisService.getClient()),
      }),
    }),

    // ─── Módulos funcionales
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    StorageModule,
  ],
  providers: [
    // ─── Activa el ThrottlerGuard globalmente para toda la aplicación
    // Cualquier controlador puede sobreescribir el límite con @Throttle()
    // o excluirse completamente con @SkipThrottle().
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }
