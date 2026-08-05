import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { DaysheetService } from './daysheet.service';

/**
 * DaysheetController — Vista consolidada del evento.
 *
 * GET /events/:id/daysheet → todo el día en una sola llamada
 *   (evento, venue, cronograma, roster, vehículos, finanzas, clima)
 *
 * GET /events/:id/weather  → pronóstico meteorológico del recinto
 *
 * Las rutas de cronograma, logística y finanzas del evento
 * están en sus propios controladores:
 *   ScheduleController     → schedule.controller.ts
 *   LogisticsController    → logistics.controller.ts
 *   EventFinanceController → event-finance.controller.ts
 */
@UseGuards(JwtAuthGuard)
@Controller('events')
export class DaysheetController {
  constructor(private readonly daysheetService: DaysheetService) {}

  @Get(':id/daysheet')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMasterDaysheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<any> {
    return this.daysheetService.getMasterDaysheet(user.id, id);
  }

  @Get(':id/weather')
  async getWeather(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const daysheet = await this.daysheetService.getMasterDaysheet(user.id, id);
    return daysheet.weather;
  }
}

