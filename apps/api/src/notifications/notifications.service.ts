import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type NotificationType =
  | 'INVITE_ACCEPTED'
  | 'INVITE_REJECTED'
  | 'ORGANIZATION_INVITE'
  | 'EVENT_ASSIGNED'
  | 'EVENT_CONFIRMED'
  | 'EVENT_CANCELLED'
  | 'ROSTER_UPDATED'
  | 'EXPENSE_APPROVED'
  | 'EXPENSE_REJECTED'
  | 'ROLE_CHANGED'
  | 'DAYSHEET_UPDATED'
  | 'INSTRUMENT_ASSIGNED'
  | 'MESSAGE_RECEIVED';

export interface CreateNotificationInput {
  recipientId: string;
  type: NotificationType;
  title: string;
  body?: string;
  sourceId?: string;
  sourceType?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // Fire-and-forget: llamar con .catch(() => {}) para no bloquear el flujo principal
  async create(data: CreateNotificationInput) {
    return this.prisma.notification.create({ data });
  }

  async createBulk(items: CreateNotificationInput[]) {
    if (!items.length) return;
    return this.prisma.notification.createMany({ data: items });
  }

  // Fuego y olvido — no lanza errores al llamador
  fire(data: CreateNotificationInput): void {
    this.create(data).catch(() => {});
  }

  fireBulk(items: CreateNotificationInput[]): void {
    this.createBulk(items).catch(() => {});
  }

  async findAll(userId: string, isRead?: boolean, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const where = {
      recipientId: userId,
      ...(isRead !== undefined && { isRead }),
    };

    const [notifications, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);

    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });

    return { notifications, total, unreadCount, page, limit };
  }

  async markRead(userId: string, id: string) {
    const n = await this.prisma.notification.findFirst({
      where: { id, recipientId: userId },
    });
    if (!n || n.isRead) return n;
    return this.prisma.notification.update({
      where: { id },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async remove(userId: string, id: string) {
    await this.prisma.notification.deleteMany({
      where: { id, recipientId: userId },
    });
    return { message: 'Notification deleted' };
  }
}
