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

const ENTRY_ROUTE = 'entries/:id';

@UseGuards(JwtAuthGuard)
@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── Categories ──────────────────────────────────────────────
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

  // ─── Entries ──────────────────────────────────────────────────
  @Post('entries')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createEntry(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFinanceEntryDto): Promise<any> {
    return this.financeService.createEntry(user.id, dto);
  }

  @Get('entries')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntries(@CurrentUser() user: AuthenticatedUser, @Query() query: QueryFinanceDto): Promise<any> {
    return this.financeService.getEntries(user.id, query);
  }

  @Get(ENTRY_ROUTE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<any> {
    return this.financeService.getEntry(user.id, id);
  }

  @Patch(ENTRY_ROUTE)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateFinanceEntryDto,
  ): Promise<any> {
    return this.financeService.updateEntry(user.id, id, dto);
  }

  @Delete(ENTRY_ROUTE)
  @HttpCode(HttpStatus.OK)
  deleteEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.financeService.deleteEntry(user.id, id);
  }

  @Patch('entries/:id/approve')
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approveEntry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<any> {
    return this.financeService.approveEntry(user.id, id);
  }

  @Patch('entries/:id/reject')
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rejectEntry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ): Promise<any> {
    return this.financeService.rejectEntry(user.id, id, reason);
  }

  // ─── Per Diem ────────────────────────────────────────────────
  @Post('per-diem')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createPerDiem(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePerDiemDto): Promise<any> {
    return this.financeService.createPerDiem(user.id, dto);
  }

  @Get('per-diem')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getPerDiems(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgId') orgId: string,
    @Query('eventId') eventId?: string,
  ): Promise<any> {
    return this.financeService.getPerDiems(user.id, orgId, eventId);
  }

  @Patch('per-diem/:id/mark-paid')
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  markPerDiemPaid(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<any> {
    return this.financeService.markPerDiemPaid(user.id, id);
  }

  // ─── Reports ──────────────────────────────────────────────────
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
