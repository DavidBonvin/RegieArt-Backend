import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { UpdateDaysheetDto } from './dto/update-daysheet.dto';
import { SearchEventsDto } from './dto/search-events.dto';
import { AddRosterMemberDto, UpdateRosterMemberDto } from './dto/roster.dto';
import { CreateVenueDto } from './dto/create-venue.dto';
import { UpdateVenueDto } from './dto/update-venue.dto';
import { MemberRole } from '@regieart/types';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── VENUES ──────────────────────────────────────────────────

  async createVenue(userId: string, dto: CreateVenueDto) {
    return this.prisma.venue.create({
      data: { ...dto, createdById: userId },
    });
  }

  async findVenues(city?: string) {
    return this.prisma.venue.findMany({
      where: city ? { city: { contains: city, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOneVenue(id: string) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('Venue not found');
    return venue;
  }

  async updateVenue(userId: string, id: string, dto: UpdateVenueDto) {
    const venue = await this.prisma.venue.findUnique({ where: { id } });
    if (!venue) throw new NotFoundException('Venue not found');
    if (venue.createdById !== userId) throw new ForbiddenException('Only the creator can edit this venue');
    return this.prisma.venue.update({ where: { id }, data: dto });
  }

  // ─── EVENTS CRUD ─────────────────────────────────────────────

  async create(userId: string, dto: CreateEventDto) {
    await this.requireAdminOrOwner(userId, dto.orgId);

    return this.prisma.event.create({
      data: {
        orgId: dto.orgId,
        title: dto.title,
        type: dto.type,
        startTime: new Date(dto.startTime),
        endTime: dto.endTime ? new Date(dto.endTime) : undefined,
        venueId: dto.venueId,
        description: dto.description,
        isPublic: dto.isPublic ?? false,
        daysheetNotes: dto.daysheetNotes,
        itineraryNotes: dto.itineraryNotes,
        setlistNotes: dto.setlistNotes,
        createdById: userId,
      },
      include: { venue: true },
    });
  }

  async findAll(userId: string, query: SearchEventsDto) {
    const { orgId, type, status, from, to, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    if (orgId) await this.requireMembership(userId, orgId);

    const where: any = {
      deletedAt: null,
      ...(orgId && { orgId }),
      ...(type && { type }),
      ...(status && { status }),
      ...(from || to
        ? {
            startTime: {
              ...(from && { gte: new Date(from) }),
              ...(to && { lte: new Date(to) }),
            },
          }
        : {}),
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.event.findMany({
        where,
        skip,
        take: limit,
        include: {
          venue: { select: { id: true, name: true, city: true } },
          _count: { select: { roster: true } },
        },
        orderBy: { startTime: 'asc' },
      }),
      this.prisma.event.count({ where }),
    ]);

    return { events, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, deletedAt: null },
      include: {
        venue: true,
        roster: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
        assets: {
          where: { deletedAt: null, status: { in: ['CONFIRMED', 'READY'] } },
          select: {
            id: true,
            assetType: true,
            displayName: true,
            contentType: true,
            sizeBytes: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!event) throw new NotFoundException('Event not found');
    await this.requireMembership(userId, event.orgId);
    return event;
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireAdminOrOwner(userId, event.orgId);

    const data: any = { ...dto };
    if (dto.startTime) data.startTime = new Date(dto.startTime);
    if (dto.endTime) data.endTime = new Date(dto.endTime);

    return this.prisma.event.update({ where: { id }, data, include: { venue: true } });
  }

  async updateDaysheet(userId: string, id: string, dto: UpdateDaysheetDto) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireAdminOrOwner(userId, event.orgId);

    return this.prisma.event.update({
      where: { id },
      data: {
        daysheetNotes: dto.daysheetNotes,
        itineraryNotes: dto.itineraryNotes,
      },
      select: { id: true, daysheetNotes: true, itineraryNotes: true, updatedAt: true },
    });
  }

  async remove(userId: string, id: string) {
    const event = await this.prisma.event.findFirst({ where: { id, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireAdminOrOwner(userId, event.orgId);

    await this.prisma.event.update({ where: { id }, data: { deletedAt: new Date(), status: 'CANCELLED' } });
    return { message: 'Event deleted successfully' };
  }

  // ─── ROSTER ──────────────────────────────────────────────────

  async getRoster(userId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireMembership(userId, event.orgId);

    return this.prisma.eventRoster.findMany({
      where: { eventId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
            email: true,
          },
        },
      },
      orderBy: { invitedAt: 'asc' },
    });
  }

  async addRosterMember(userId: string, eventId: string, dto: AddRosterMemberDto) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireAdminOrOwner(userId, event.orgId);

    // Verify target user exists and is a member of the org
    const targetMembership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: dto.userId, organizationId: event.orgId } },
    });
    if (!targetMembership) throw new ForbiddenException('Target user is not a member of this organization');

    const existing = await this.prisma.eventRoster.findUnique({
      where: { eventId_userId: { eventId, userId: dto.userId } },
    });
    if (existing) throw new ConflictException('User is already on the roster for this event');

    const rosterEntry = await this.prisma.eventRoster.create({
      data: {
        eventId,
        userId: dto.userId,
        role: dto.role,
        notes: dto.notes,
      },
      include: {
        user:  { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    this.notifications.fire({
      recipientId: dto.userId,
      type:        'EVENT_ASSIGNED',
      title:       `Te añadieron al evento: ${event.title}`,
      body:        dto.role ? `Tu rol: ${dto.role}` : undefined,
      sourceId:    eventId,
      sourceType:  'event',
    });

    return rosterEntry;
  }

  async updateRosterMember(
    userId: string,
    eventId: string,
    targetUserId: string,
    dto: UpdateRosterMemberDto,
  ) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');

    // The member can update their own status; admins can update role/notes
    const isAdminOrOwner = await this.isAdminOrOwner(userId, event.orgId);
    const isSelf = userId === targetUserId;

    if (!isAdminOrOwner && !isSelf) throw new ForbiddenException('Not enough permissions');
    if (!isAdminOrOwner && (dto.role !== undefined || dto.notes !== undefined)) {
      throw new ForbiddenException('Only admins can change role or notes');
    }

    const entry = await this.prisma.eventRoster.findUnique({
      where: { eventId_userId: { eventId, userId: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Roster entry not found');

    return this.prisma.eventRoster.update({
      where: { id: entry.id },
      data: {
        ...(dto.status !== undefined && { status: dto.status, respondedAt: new Date() }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
  }

  async removeRosterMember(userId: string, eventId: string, targetUserId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, deletedAt: null } });
    if (!event) throw new NotFoundException('Event not found');
    await this.requireAdminOrOwner(userId, event.orgId);

    const entry = await this.prisma.eventRoster.findUnique({
      where: { eventId_userId: { eventId, userId: targetUserId } },
    });
    if (!entry) throw new NotFoundException('Roster entry not found');

    await this.prisma.eventRoster.delete({ where: { id: entry.id } });
    return { message: 'Member removed from roster' };
  }

  // ─── HELPERS ─────────────────────────────────────────────────

  private async requireMembership(userId: string, orgId: string) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!m) throw new ForbiddenException('You are not a member of this organization');
    return m;
  }

  private async requireAdminOrOwner(userId: string, orgId: string) {
    const m = await this.requireMembership(userId, orgId);
    if (m.role !== MemberRole.OWNER && m.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('Admin or Owner role required');
    }
    return m;
  }

  private async isAdminOrOwner(userId: string, orgId: string): Promise<boolean> {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    return m?.role === MemberRole.OWNER || m?.role === MemberRole.ADMIN;
  }
}
