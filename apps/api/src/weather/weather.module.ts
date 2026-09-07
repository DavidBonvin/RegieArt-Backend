import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { WeatherAdviceService } from './services/weather-advice.service';
import { WeatherAlertsService } from './services/weather-alerts.service';
import { WeatherDashboardService } from './services/weather-dashboard.service';

@Module({
  controllers: [WeatherController],
  providers: [
    WeatherService,
    WeatherAdviceService,
    WeatherAlertsService,
    WeatherDashboardService,
  ],
  exports: [WeatherService],
})
export class WeatherModule {}
