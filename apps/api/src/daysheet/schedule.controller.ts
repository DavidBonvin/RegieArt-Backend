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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';
import { ScheduleService } from './services/schedule.service';
import { CreateScheduleItemDto } from './dto/create-schedule-item.dto';
import { UpdateScheduleItemDto } from './dto/update-schedule-item.dto';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class ScheduleController {
  constructor(private readonly scheduleService: ScheduleService) {}

  // POST /events/:id/schedule
  @Post(':id/schedule')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CreateScheduleItemDto,
  ) {
    return this.scheduleService.create(user.id, id, dto);
  }

  // GET /events/:id/schedule
  @Get(':id/schedule')
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.scheduleService.findAll(user.id, id);
  }

  // PATCH /events/:id/schedule/:itemId
  @Patch(':id/schedule/:itemId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateScheduleItemDto,
  ) {
    return this.scheduleService.update(user.id, id, itemId, dto);
  }

  // PATCH /events/:id/schedule/:itemId/complete — toggle tracking en vivo
  @Patch(':id/schedule/:itemId/complete')
  @HttpCode(HttpStatus.OK)
  toggleComplete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.scheduleService.toggleComplete(user.id, id, itemId);
  }

  // DELETE /events/:id/schedule/:itemId
  @Delete(':id/schedule/:itemId')
  @HttpCode(HttpStatus.OK)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.scheduleService.remove(user.id, id, itemId);
  }
}
