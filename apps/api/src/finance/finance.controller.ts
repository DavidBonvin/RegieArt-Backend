import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { FinanceService } from './finance.service';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { CreateFinanceEntryDto } from './dto/create-finance-entry.dto';
import { UpdateFinanceEntryDto } from './dto/update-finance-entry.dto';
import { CreatePerDiemDto } from './dto/create-per-diem.dto';
import { QueryFinanceDto } from './dto/query-finance.dto';

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Categorías ──────────────────────────────────────────────
  @Post('categories')
  createCategory(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceCategoryDto) {
    return this.financeService.createCategory(user.id, dto);
  }

  @Get('categories')
  getCategories(@CurrentUser() user: AuthenticatedUser, @Query('orgId') orgId: string) {
    return this.financeService.getCategories(user.id, orgId);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.OK)
  deleteCategory(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.deleteCategory(user.id, id);
  }

  // ─── Entradas ────────────────────────────────────────────────
  @Post('entries')
  createEntry(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceEntryDto) {
    return this.financeService.createEntry(user.id, dto);
  }

  @Get('entries')
  getEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryFinanceDto) {
    return this.financeService.getEntries(user.id, query);
  }

  @Get('entries/:id')
  getEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.getEntry(user.id, id);
  }

  @Patch('entries/:id')
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceEntryDto,
  ) {
    return this.financeService.updateEntry(user.id, id, dto);
  }

  @Delete('entries/:id')
  @HttpCode(HttpStatus.OK)
  deleteEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.deleteEntry(user.id, id);
  }

  @Patch('entries/:id/approve')
  @HttpCode(HttpStatus.OK)
  approveEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.approveEntry(user.id, id);
  }

  @Patch('entries/:id/reject')
  @HttpCode(HttpStatus.OK)
  rejectEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.financeService.rejectEntry(user.id, id, reason);
  }

  // ─── Per Diem ────────────────────────────────────────────────
  @Post('per-diem')
  createPerDiem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePerDiemDto) {
    return this.financeService.createPerDiem(user.id, dto);
  }

  @Get('per-diem')
  getPerDiems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgId') orgId: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.financeService.getPerDiems(user.id, orgId, eventId);
  }

  @Patch('per-diem/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  markPerDiemPaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.markPerDiemPaid(user.id, id);
  }

  // ─── Reportes ────────────────────────────────────────────────
  @Get('reports')
  getReport(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgId') orgId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financeService.getReport(user.id, orgId, from, to);
  }
}
