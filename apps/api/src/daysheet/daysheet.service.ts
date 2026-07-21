// ============================================================
// DaysheetService — Endpoint maestro GET /events/:id/daysheet
//
// Consolida en una única respuesta JSON todo lo que la app
// móvil necesita para mostrar el día de un evento:
//   event + venue (con parking/loadIn/coords)
//   schedule    (cronograma ordenado por startTime)
//   roster      (músicos con estado de confirmación)
//   vehicles    (con pasajeros y pickups)
//   finance     (caché y viáticos — solo ADMIN/OWNER)
//   weather     (predicción meteorológica — null si no disponible)
// ============================================================

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WeatherService } from './services/weather.service';
import { MemberRole } from '@regieart/types';

@Injectable()
export class DaysheetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
  ) {}

  async getMasterDaysheet(userId: string, eventId: string): Promise<any> {
    // 1. Evento + venue
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: {
        venue: true,
        organization: { select: { id: true, name: true, slug: true } },
        createdBy: { select: { id: true, displayName: true } },
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    // 2. Verificar membresía
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: event.orgId } },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this organization');

    const isAdminOrOwner =
      membership.role === MemberRole.OWNER || membership.role === MemberRole.ADMIN;

    // 3. Cargar todo en paralelo
    const [schedule, roster, vehicles, finance, weather] = await Promise.all([
      this.prisma.eventScheduleItem.findMany({
        where: { eventId },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.eventRoster.findMany({
        where: { eventId },
        include: {
          user: {
            select: { id: true, displayName: true, firstName: true, lastName: true, avatarUrl: true, phone: true },
          },
        },
        orderBy: { invitedAt: 'asc' },
      }),
      this.prisma.eventVehicle.findMany({
        where: { eventId },
        include: {
          passengers: {
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
          pickups: { orderBy: { order: 'asc' } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      isAdminOrOwner
        ? this.prisma.eventFinance.findUnique({ where: { eventId } })
        : Promise.resolve(null), // Los MEMBER no ven finanzas
      this.getWeatherForEvent(event),
    ]);

    return {
      event: {
        id:             event.id,
        title:          event.title,
        type:           event.type,
        status:         event.status,
        startTime:      event.startTime,
        endTime:        event.endTime,
        description:    event.description,
        isPublic:       event.isPublic,
        daysheetNotes:  event.daysheetNotes,
        itineraryNotes: event.itineraryNotes,
        riderAssetId:   event.riderAssetId,
        organization:   event.organization,
        createdBy:      event.createdBy,
      },
      venue: event.venue,
      schedule,
      roster,
      vehicles,
      finance: isAdminOrOwner ? finance : undefined,
      weather,
      meta: {
        totalScheduleItems:   schedule.length,
        completedItems:       schedule.filter(i => i.isCompleted).length,
        confirmedAttendees:   roster.filter(r => r.status === 'CONFIRMED').length,
        totalAttendees:       roster.length,
        totalVehicles:        vehicles.length,
        isAdminView:          isAdminOrOwner,
      },
    };
  }

  async getWeatherForEvent(event: {
    venueId:   string | null;
    startTime: Date;
    venue:     { latitude: number | null; longitude: number | null } | null;
  }) {
    if (!event.venue || event.venue.latitude == null || event.venue.longitude == null) {
      return { available: false, reason: 'El recinto no tiene coordenadas de geolocalización configuradas' };
    }
    return this.weather.getForecast(event.venue.latitude, event.venue.longitude, event.startTime);
  }
}
