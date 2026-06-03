import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';

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

    // ─── Módulos funcionales
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
  ],
})
export class AppModule { }
