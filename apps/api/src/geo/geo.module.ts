import { Module } from '@nestjs/common';
import { GeoController } from './geo.controller';
import { GeoService } from './geo.service';
import { ConvoyService } from './convoy.service';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [GeoController],
  providers: [GeoService, ConvoyService],
  exports: [GeoService, ConvoyService],
})
export class GeoModule {}
