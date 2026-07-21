import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateDaysheetDto } from './dto/update-daysheet.dto';
import { SearchEventsDto } from './dto/search-events.dto';
import { AddRosterMemberDto, UpdateRosterMemberDto } from './dto/roster.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '@regieart/types';

@UseGuards(JwtAuthGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  // ═══════════════════════════════════════════════════════════
  // EVENTS CRUD
  // ═══════════════════════════════════════════════════════════

  // POST /events
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEventDto) {
    return this.eventsService.create(user.id, dto);
  }

  // GET /events?orgId=&type=&status=&from=&to=&page=&limit=
  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: SearchEventsDto) {
    return this.eventsService.findAll(user.id, query);
  }

  // GET /events/:id — detalle completo con venue, roster y assets
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.findOne(user.id, id);
  }

  // PATCH /events/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ) {
    return this.eventsService.update(user.id, id, dto);
  }

  // PATCH /events/:id/daysheet — actualizar notas de producción (Day Sheet)
  @Patch(':id/daysheet')
  updateDaysheet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateDaysheetDto,
  ) {
    return this.eventsService.updateDaysheet(user.id, id, dto);
  }

  // DELETE /events/:id — soft delete + status CANCELLED
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.remove(user.id, id);
  }

  // ═══════════════════════════════════════════════════════════
  // ROSTER (Participantes del evento)
  // ═══════════════════════════════════════════════════════════

  // GET /events/:id/roster
  @Get(':id/roster')
  getRoster(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.eventsService.getRoster(user.id, id);
  }

  // POST /events/:id/roster — invitar músico al evento
  @Post(':id/roster')
  addRosterMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: AddRosterMemberDto,
  ) {
    return this.eventsService.addRosterMember(user.id, id, dto);
  }

  // PATCH /events/:id/roster/:userId — confirmar, declinar, cambiar rol
  @Patch(':id/roster/:userId')
  updateRosterMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateRosterMemberDto,
  ) {
    return this.eventsService.updateRosterMember(user.id, id, userId, dto);
  }

  // DELETE /events/:id/roster/:userId — remover del roster
  @Delete(':id/roster/:userId')
  @HttpCode(HttpStatus.OK)
  removeRosterMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
  ) {
    return this.eventsService.removeRosterMember(user.id, id, userId);
  }
}

// ═══════════════════════════════════════════════════════════
// VENUES (sub-recurso independiente de eventos)
// ═══════════════════════════════════════════════════════════

@UseGuards(JwtAuthGuard)
@Controller('venues')
export class VenuesController {
  constructor(private readonly eventsService: EventsService) {}

  // POST /venues
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateVenueDto) {
    return this.eventsService.createVenue(user.id, dto);
  }

  // GET /venues?city=
  @Get()
  findAll(@Query('city') city?: string) {
    return this.eventsService.findVenues(city);
  }

  // GET /venues/:id
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.eventsService.findOneVenue(id);
  }

  // PATCH /venues/:id
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVenueDto,
  ) {
    return this.eventsService.updateVenue(user.id, id, dto);
  }
}
