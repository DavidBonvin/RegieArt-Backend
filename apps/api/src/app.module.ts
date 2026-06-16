import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
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

    // ─── Rate limiting global (in-memory store)
    // 60 peticiones por minuto por IP. In-memory es suficiente para una instancia.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 60 }],
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
