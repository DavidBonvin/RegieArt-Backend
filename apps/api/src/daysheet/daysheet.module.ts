import { Module } from '@nestjs/common';
import { DaysheetController } from './daysheet.controller';
import { ScheduleController } from './schedule.controller';
import { LogisticsController } from './logistics.controller';
import { EventFinanceController } from './event-finance.controller';
import { DaysheetService } from './daysheet.service';
import { ScheduleService } from './services/schedule.service';
import { VehiclesService } from './services/vehicles.service';
import { FinanceService } from './services/finance.service';
import { WeatherService } from './services/weather.service';

@Module({
  controllers: [
    DaysheetController,     // GET /events/:id/daysheet  GET /events/:id/weather
    ScheduleController,     // CRUD /events/:id/schedule
    LogisticsController,    // CRUD /events/:id/vehicles + passengers + pickups
    EventFinanceController, // GET PUT /events/:id/finance
  ],
  providers: [
    DaysheetService,
    ScheduleService,
    VehiclesService,
    FinanceService,
    WeatherService,
  ],
  exports: [DaysheetService, WeatherService],
})
export class DaysheetModule {}
