import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async send(senderId: string, dto: CreateMessageDto) {
    if (senderId === dto.recipientId) {
      throw new BadRequestException('Cannot send a message to yourself');
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: dto.recipientId, isActive: true },
      select: { id: true, displayName: true },
    });
    if (!recipient) throw new NotFoundException('Recipient not found');

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true },
    });

    const message = await this.prisma.message.create({
      data: {
        senderId,
        recipientId: dto.recipientId,
        orgId:       dto.orgId,
        body:        dto.body,
      },
      include: {
        sender:    { select: { id: true, displayName: true, avatarUrl: true } },
        recipient: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });

    this.notifications.fire({
      recipientId: dto.recipientId,
      type:        'MESSAGE_RECEIVED',
      title:       `Nuevo mensaje de ${sender?.displayName ?? 'alguien'}`,
      body:        dto.body.slice(0, 100),
      sourceId:    message.id,
      sourceType:  'message',
    });

    return message;
  }

  // Lista las conversaciones del usuario (un registro por interlocutor)
  async getConversations(userId: string) {
    // Obtener IDs únicos de interlocutores
    const [sent, received] = await Promise.all([
      this.prisma.message.findMany({
        where: { senderId: userId },
        select: { recipientId: true },
        distinct: ['recipientId'],
      }),
      this.prisma.message.findMany({
        where: { recipientId: userId },
        select: { senderId: true },
        distinct: ['senderId'],
      }),
    ]);

    const partnerIds = [
      ...new Set([
        ...sent.map(m => m.recipientId),
        ...received.map(m => m.senderId),
      ]),
    ];

    // Para cada interlocutor, obtener el último mensaje y el count de no leídos
    const conversations = await Promise.all(
      partnerIds.map(async partnerId => {
        const [lastMessage, unread, partner] = await Promise.all([
          this.prisma.message.findFirst({
            where: {
              OR: [
                { senderId: userId, recipientId: partnerId },
                { senderId: partnerId, recipientId: userId },
              ],
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, body: true, senderId: true, createdAt: true },
          }),
          this.prisma.message.count({
            where: { senderId: partnerId, recipientId: userId, isRead: false },
          }),
          this.prisma.user.findUnique({
            where: { id: partnerId },
            select: { id: true, displayName: true, avatarUrl: true },
          }),
        ]);
        return { partner, lastMessage, unreadCount: unread };
      }),
    );

    // Ordenar por lastMessage.createdAt desc
    return conversations
      .filter(c => c.partner)
      .sort((a, b) =>
        new Date(b.lastMessage?.createdAt ?? 0).getTime() -
        new Date(a.lastMessage?.createdAt ?? 0).getTime(),
      );
  }

  async getConversationWith(
    userId: string,
    partnerId: string,
    page = 1,
    limit = 30,
  ) {
    const partner = await this.prisma.user.findUnique({
      where: { id: partnerId },
      select: { id: true, displayName: true, avatarUrl: true },
    });
    if (!partner) throw new NotFoundException('User not found');

    const skip = (page - 1) * limit;
    const where = {
      OR: [
        { senderId: userId, recipientId: partnerId },
        { senderId: partnerId, recipientId: userId },
      ],
    };

    const [messages, total] = await this.prisma.$transaction([
      this.prisma.message.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          sender:    { select: { id: true, displayName: true, avatarUrl: true } },
          recipient: { select: { id: true, displayName: true, avatarUrl: true } },
        },
      }),
      this.prisma.message.count({ where }),
    ]);

    // Marcar como leídos los mensajes recibidos en esta conversación
    await this.prisma.message.updateMany({
      where: { senderId: partnerId, recipientId: userId, isRead: false },
      data:  { isRead: true, readAt: new Date() },
    });

    return { partner, messages: messages.reverse(), total, page, limit };
  }

  async markRead(userId: string, messageId: string) {
    const msg = await this.prisma.message.findFirst({
      where: { id: messageId, recipientId: userId },
    });
    if (!msg) throw new ForbiddenException('Message not found or not yours');
    if (msg.isRead) return msg;
    return this.prisma.message.update({
      where: { id: messageId },
      data:  { isRead: true, readAt: new Date() },
    });
  }
}
