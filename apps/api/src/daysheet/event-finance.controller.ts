import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { FinanceService } from './services/finance.service';
import { UpsertEventFinanceDto } from './dto/upsert-event-finance.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventFinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // GET /events/:id/finance — resumen financiero del evento
  @Get(':id/finance')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFinance(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<any> {
    return this.financeService.getFinance(user.id, id);
  }

  // PUT /events/:id/finance — crear o actualizar (upsert)
  @Put(':id/finance')
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertFinance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpsertEventFinanceDto,
  ): Promise<any> {
    return this.financeService.upsertFinance(user.id, id, dto);
  }
}
