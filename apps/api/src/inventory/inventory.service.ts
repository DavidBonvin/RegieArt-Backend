import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MemberRole } from '@regieart/types';
import { CreateInstrumentDto, InstrumentType } from './dto/create-instrument.dto';
import { AssignInstrumentDto } from './dto/assign-instrument.dto';
import { InstrumentStatus } from '@regieart/database';

const INSTRUMENT_NOT_FOUND = 'Instrument not found';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateInstrumentDto) {
    await this.requireAdminOrOwner(userId, dto.orgId);
    return this.prisma.instrument.create({
      data: { ...dto, createdById: userId },
    });
  }

  async findAll(userId: string, orgId: string, type?: InstrumentType, status?: string) {
    await this.requireMembership(userId, orgId);
    return this.prisma.instrument.findMany({
      where: {
        orgId,
        isActive: true,
        ...(type   && { type }),
        ...(status && { status: status as InstrumentStatus }),
      },
      include: {
        assignments: {
          where: { returnedAt: null },
          include: {
            user:  { select: { id: true, displayName: true, avatarUrl: true } },
            event: { select: { id: true, title: true } },
          },
          orderBy: { assignedAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(userId: string, id: string) {
    const instrument = await this.prisma.instrument.findUnique({
      where: { id },
      include: {
        assignments: {
          include: {
            user:  { select: { id: true, displayName: true, avatarUrl: true } },
            event: { select: { id: true, title: true } },
          },
          orderBy: { assignedAt: 'desc' },
        },
      },
    });
    if (!instrument || !instrument.isActive) throw new NotFoundException(INSTRUMENT_NOT_FOUND);
    await this.requireMembership(userId, instrument.orgId);
    return instrument;
  }

  async update(userId: string, id: string, dto: Partial<CreateInstrumentDto>) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id } });
    if (!instrument || !instrument.isActive) throw new NotFoundException(INSTRUMENT_NOT_FOUND);
    await this.requireAdminOrOwner(userId, instrument.orgId);
    const { orgId: _orgId, ...data } = dto;
    return this.prisma.instrument.update({ where: { id }, data });
  }

  async retire(userId: string, id: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id } });
    if (!instrument) throw new NotFoundException(INSTRUMENT_NOT_FOUND);
    await this.requireAdminOrOwner(userId, instrument.orgId);
    return this.prisma.instrument.update({
      where: { id },
      data: { isActive: false, status: 'RETIRED' },
    });
  }

  async assign(adminId: string, instrumentId: string, dto: AssignInstrumentDto) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument || !instrument.isActive) throw new NotFoundException(INSTRUMENT_NOT_FOUND);
    await this.requireAdminOrOwner(adminId, instrument.orgId);

    if (instrument.status === 'IN_USE') throw new ConflictException('Instrument is already in use');
    if (instrument.status === 'MAINTENANCE') throw new ConflictException('Instrument is under maintenance');

    const [assignment] = await this.prisma.$transaction([
      this.prisma.instrumentAssignment.create({
        data: {
          instrumentId,
          userId:  dto.userId,
          eventId: dto.eventId,
          notes:   dto.notes,
        },
        include: { user: { select: { id: true, displayName: true } } },
      }),
      this.prisma.instrument.update({
        where: { id: instrumentId },
        data:  { status: 'IN_USE' },
      }),
    ]);

    if (dto.userId) {
      this.notifications.fire({
        recipientId: dto.userId,
        type:        'INSTRUMENT_ASSIGNED',
        title:       `Instrumento asignado: ${instrument.name}`,
        body:        instrument.brand ? `${instrument.brand} ${instrument.model ?? ''}`.trim() : undefined,
        sourceId:    instrumentId,
        sourceType:  'instrument',
      });
    }

    return assignment;
  }

  async returnInstrument(adminId: string, instrumentId: string) {
    const instrument = await this.prisma.instrument.findUnique({ where: { id: instrumentId } });
    if (!instrument) throw new NotFoundException(INSTRUMENT_NOT_FOUND);
    await this.requireAdminOrOwner(adminId, instrument.orgId);

    const activeAssignment = await this.prisma.instrumentAssignment.findFirst({
      where: { instrumentId, returnedAt: null },
      orderBy: { assignedAt: 'desc' },
    });

    if (!activeAssignment) throw new ConflictException('Instrument is not currently assigned');

    await this.prisma.$transaction([
      this.prisma.instrumentAssignment.update({
        where: { id: activeAssignment.id },
        data:  { returnedAt: new Date() },
      }),
      this.prisma.instrument.update({
        where: { id: instrumentId },
        data:  { status: 'AVAILABLE' },
      }),
    ]);

    return { message: 'Instrument returned successfully' };
  }

  async getAssignments(userId: string, orgId?: string, eventId?: string) {
    if (orgId) await this.requireMembership(userId, orgId);

    const where = {
      returnedAt: null,
      ...(eventId && { eventId }),
      ...(orgId   && { instrument: { orgId } }),
    };

    return this.prisma.instrumentAssignment.findMany({
      where,
      include: {
        instrument: { select: { id: true, name: true, brand: true, type: true, status: true } },
        user:       { select: { id: true, displayName: true, avatarUrl: true } },
        event:      { select: { id: true, title: true } },
      },
      orderBy: { assignedAt: 'asc' },
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────

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
  }
}
