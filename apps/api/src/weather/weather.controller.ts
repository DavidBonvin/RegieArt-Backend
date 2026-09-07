// ============================================================
// WeatherController — Endpoints públicos del módulo de clima.
//
//   GET /weather/dashboard  → tarjeta de bienvenida (saludo + consejo)
//   GET /weather/current    → clima actual en una ubicación
//   GET /weather/forecast   → previsión de hasta 14 días
//   GET /weather/alerts     → avisos para los próximos eventos del usuario
//
// El pronóstico de un evento concreto vive en GET /events/:id/weather.
// ============================================================

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { WeatherService } from './weather.service';
import { WeatherDashboardService } from './services/weather-dashboard.service';
import { WeatherAlertsService } from './services/weather-alerts.service';
import {
  WeatherAlertsQueryDto,
  WeatherForecastQueryDto,
  WeatherLocationQueryDto,
} from './dto/weather-query.dto';

const DEFAULT_FORECAST_DAYS = 3;
const DEFAULT_ALERT_WINDOW_HOURS = 72;

@UseGuards(JwtAuthGuard)
@Controller('weather')
export class WeatherController {
  constructor(
    private readonly weather: WeatherService,
    private readonly dashboard: WeatherDashboardService,
    private readonly alerts: WeatherAlertsService,
  ) {}

  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeatherLocationQueryDto,
  ) {
    return this.dashboard.getDashboard(user.id, query);
  }

  @Get('current')
  async getCurrent(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeatherLocationQueryDto,
  ) {
    const location = await this.dashboard.resolveLocation(user.id, query);
    return this.weather.getCurrent(location);
  }

  @Get('forecast')
  async getForecast(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeatherForecastQueryDto,
  ) {
    const location = await this.dashboard.resolveLocation(user.id, query);
    return this.weather.getDailyForecast(location, query.days ?? DEFAULT_FORECAST_DAYS);
  }

  @Get('alerts')
  getAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WeatherAlertsQueryDto,
  ) {
    return this.alerts.getUpcomingAlerts(user.id, query.hours ?? DEFAULT_ALERT_WINDOW_HOURS);
  }
}
