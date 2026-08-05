import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberRole } from '@regieart/types';
import { CreateScheduleItemDto } from '../dto/create-schedule-item.dto';
import { UpdateScheduleItemDto } from '../dto/update-schedule-item.dto';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, eventId: string, dto: CreateScheduleItemDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);

    return this.prisma.eventScheduleItem.create({
      data: {
        eventId,
        type:      dto.type,
        title:     dto.title,
        startTime: new Date(dto.startTime),
        endTime:   dto.endTime ? new Date(dto.endTime) : undefined,
        location:  dto.location,
        withWho:   dto.withWho,
        notes:     dto.notes,
      },
    });
  }

  async findAll(userId: string, eventId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireMembership(userId, event.orgId);

    return this.prisma.eventScheduleItem.findMany({
      where: { eventId },
      orderBy: { startTime: 'asc' },
    });
  }

  async update(userId: string, eventId: string, itemId: string, dto: UpdateScheduleItemDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);

    await this.getItemOrFail(itemId, eventId);

    const { startTime: startTimeStr, endTime: endTimeStr, isCompleted, ...dtoRest } = dto;
    const data = {
      ...dtoRest,
      ...(startTimeStr && { startTime: new Date(startTimeStr) }),
      ...(endTimeStr   && { endTime:   new Date(endTimeStr) }),
      ...(isCompleted  !== undefined && { isCompleted }),
      // Si se marca como completado ahora, registrar timestamp
      ...(isCompleted  === true      && { completedAt: new Date() }),
      ...(isCompleted  === false     && { completedAt: null }),
    };

    return this.prisma.eventScheduleItem.update({ where: { id: itemId }, data });
  }

  // Toggle rápido de completado — disponible para cualquier miembro (móvil, día del show)
  async toggleComplete(userId: string, eventId: string, itemId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireMembership(userId, event.orgId);

    const item = await this.getItemOrFail(itemId, eventId);
    const isCompleted = !item.isCompleted;

    return this.prisma.eventScheduleItem.update({
      where: { id: itemId },
      data:  {
        isCompleted,
        completedAt: isCompleted ? new Date() : null,
      },
    });
  }

  async remove(userId: string, eventId: string, itemId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);
    await this.getItemOrFail(itemId, eventId);

    await this.prisma.eventScheduleItem.delete({ where: { id: itemId } });
    return { message: 'Schedule item deleted' };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async getEventOrFail(eventId: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { id: true, orgId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    return event;
  }

  private async getItemOrFail(itemId: string, eventId: string) {
    const item = await this.prisma.eventScheduleItem.findFirst({
      where: { id: itemId, eventId },
    });
    if (!item) throw new NotFoundException('Schedule item not found');
    return item;
  }

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
