import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { InventoryService } from './inventory.service';
import { CreateInstrumentDto, InstrumentType } from './dto/create-instrument.dto';
import { AssignInstrumentDto } from './dto/assign-instrument.dto';

@UseGuards(JwtAuthGuard)
@Controller('instruments')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  // GET /instruments/assignments — debe ir ANTES de /:id
  @Get('assignments')
  getAssignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgId') orgId?: string,
    @Query('eventId') eventId?: string,
  ) {
    return this.inventoryService.getAssignments(user.id, orgId, eventId);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateInstrumentDto) {
    return this.inventoryService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('orgId') orgId: string,
    @Query('type') type?: InstrumentType,
    @Query('status') status?: string,
  ) {
    return this.inventoryService.findAll(user.id, orgId, type, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryService.findOne(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: Partial<CreateInstrumentDto>,
  ) {
    return this.inventoryService.update(user.id, id, dto);
  }

  @Patch(':id/retire')
  @HttpCode(HttpStatus.OK)
  retire(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryService.retire(user.id, id);
  }

  @Post(':id/assign')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AssignInstrumentDto,
  ) {
    return this.inventoryService.assign(user.id, id, dto);
  }

  @Patch(':id/return')
  @HttpCode(HttpStatus.OK)
  returnInstrument(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.inventoryService.returnInstrument(user.id, id);
  }
}
