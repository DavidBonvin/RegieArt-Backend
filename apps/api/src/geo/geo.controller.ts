import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GeoService } from './geo.service';
import { ConvoyService } from './convoy.service';
import { GeocodeDto } from './dto/geocode.dto';
import { AutocompleteDto } from './dto/autocomplete.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller()
export class GeoController {
  constructor(
    private readonly geoService: GeoService,
    private readonly convoyService: ConvoyService,
  ) {}

  // POST /geo/geocode
  @Post('geo/geocode')
  geocode(@Body() dto: GeocodeDto) {
    return this.geoService.geocode(dto);
  }

  // GET /geo/autocomplete?q=&country=
  @Get('geo/autocomplete')
  autocomplete(@Query() dto: AutocompleteDto) {
    return this.geoService.autocomplete(dto);
  }

  // POST /events/:id/vehicles/:vehicleId/route
  @UseGuards(JwtAuthGuard)
  @Post('events/:id/vehicles/:vehicleId/route')
  calculateRoute(
    @Param('id') eventId: string,
    @Param('vehicleId') vehicleId: string,
  ) {
    return this.convoyService.calculateRoute(eventId, vehicleId);
  }

  // GET /events/:id/convoy/summary
  @UseGuards(JwtAuthGuard)
  @Get('events/:id/convoy/summary')
  getConvoySummary(@Param('id') eventId: string) {
    return this.convoyService.getConvoySummary(eventId);
  }
}
