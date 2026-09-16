import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../notifications/email.service';
import { MemberRole } from '@regieart/types';
import { SendInvitationDto } from './dto/send-invitation.dto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly email: EmailService,
  ) {}

  private get appUrl(): string {
    return process.env.APP_URL ?? 'http://localhost:3001';
  }

  private withResponseState<T extends { token: string; status: string; expiresAt: Date }>(invitation: T) {
    const isExpired = invitation.status === 'EXPIRED' || invitation.expiresAt < new Date();
    const status = isExpired ? 'EXPIRED' : invitation.status;

    return {
      ...invitation,
      status,
      canRespond: status === 'PENDING',
      statusMessage: this.getInvitationStatusMessage(status),
      inviteUrl: `${this.appUrl}/invitations/${invitation.token}`,
    };
  }

  private getInvitationStatusMessage(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Invitation en attente';
      case 'ACCEPTED':
        return 'Invitation déjà acceptée';
      case 'REJECTED':
        return 'Invitation déjà refusée';
      case 'REVOKED':
        return 'Invitation révoquée';
      case 'EXPIRED':
        return 'Invitation expirée';
      default:
        return 'Statut d\'invitation inconnu';
    }
  }

  // ─── Send invitation ─────────────────────────────────────────

  async sendInvitation(senderId: string, orgId: string, dto: SendInvitationDto) {
    await this.requireAdminOrOwner(senderId, orgId);

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, isActive: true },
      select: { id: true, name: true, logoUrl: true },
    });
    if (!org) throw new NotFoundException('Organisation introuvable');

    // Prevent duplicate pending invitation to the same email
    const duplicate = await this.prisma.invitation.findFirst({
      where: { organizationId: orgId, targetEmail: dto.email, status: 'PENDING' },
    });
    if (duplicate) {
      throw new ConflictException('Une invitation est déjà en attente pour cette adresse e-mail');
    }

    // Check if the email is already a member
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, displayName: true, email: true },
    });
    if (existingUser) {
      const alreadyMember = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: existingUser.id, organizationId: orgId } },
      });
      if (alreadyMember) {
        throw new ConflictException('Cet utilisateur est déjà membre de cette organisation');
      }
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true },
    });

    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days default

    const invitation = await this.prisma.invitation.create({
      data: {
        organizationId:  orgId,
        createdById:     senderId,
        targetEmail:     dto.email,
        targetUserId:    existingUser?.id ?? null,
        role:            dto.role ?? MemberRole.MEMBER,
        instrument:      dto.instrument,
        personalMessage: dto.personalMessage,
        expiresAt,
      },
      select: {
        id: true,
        token: true,
        targetEmail: true,
        targetUserId: true,
        role: true,
        instrument: true,
        personalMessage: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    const inviteUrl = `${this.appUrl}/invitations/${invitation.token}`;

    // Always send email — user may have uninstalled the app or miss the in-app notification
    this.email.sendInvitationEmail({
      to:              dto.email,
      inviterName:     sender?.displayName ?? 'Un miembro',
      orgName:         org.name,
      orgLogoUrl:      org.logoUrl ?? undefined,
      role:            dto.role ?? MemberRole.MEMBER,
      instrument:      dto.instrument,
      personalMessage: dto.personalMessage,
      inviteUrl,
      expiresAt,
    }).catch(() => {}); // fire-and-forget

    if (existingUser) {
      // Also send in-app notification for users with the app open
      this.notifications.fire({
        recipientId: existingUser.id,
        type:        'ORGANIZATION_INVITE',
        title:       `${sender?.displayName ?? 'Quelqu\'un'} vous invite à rejoindre ${org.name}`,
        body:        dto.personalMessage,
        sourceId:    invitation.id,
        sourceType:  'invitation',
      });
    }

    return this.withResponseState({ ...invitation, inviteUrl });
  }

  // ─── List invitations sent by an org (admin view) ────────────

  async getOrgInvitations(userId: string, orgId: string) {
    await this.requireAdminOrOwner(userId, orgId);
    return this.prisma.invitation.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        token: true,
        targetEmail: true,
        role: true,
        instrument: true,
        status: true,
        expiresAt: true,
        respondedAt: true,
        createdAt: true,
        createdBy: { select: { id: true, displayName: true } },
        targetUser: { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── My pending invitations (receiver view) ──────────────────

  async getMyInvitations(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    // Expire stale invitations silently
    await this.prisma.invitation.updateMany({
      where: { targetEmail: user.email, status: 'PENDING', expiresAt: { lt: new Date() } },
      data:  { status: 'EXPIRED' },
    });

    return this.prisma.invitation.findMany({
      where: { targetEmail: user.email, status: 'PENDING' },
      select: {
        id: true,
        token: true,
        role: true,
        instrument: true,
        personalMessage: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true, logoUrl: true, description: true } },
        createdBy:    { select: { id: true, displayName: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Get invitation details by token (public) ────────────────

  async getInvitationByToken(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      select: {
        token: true,
        id: true,
        role: true,
        instrument: true,
        personalMessage: true,
        status: true,
        expiresAt: true,
        organization: { select: { id: true, name: true, logoUrl: true, description: true } },
        createdBy:    { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invitation introuvable');

    if (inv.status === 'PENDING' && inv.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { token }, data: { status: 'EXPIRED' } });
      return this.withResponseState({ ...inv, status: 'EXPIRED' });
    }

    return this.withResponseState(inv);
  }

  // ─── Get invitation details by id (notification click) ───────

  async getInvitationById(userId: string, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const inv = await this.prisma.invitation.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        targetEmail: true,
        targetUserId: true,
        role: true,
        instrument: true,
        personalMessage: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        organization: { select: { id: true, name: true, logoUrl: true, description: true } },
        createdBy:    { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    if (!inv) throw new NotFoundException('Invitation introuvable');

    if (inv.targetUserId && inv.targetUserId !== userId) {
      throw new ForbiddenException('Cette invitation appartient à un autre utilisateur');
    }
    if (inv.targetEmail !== user.email) {
      throw new ForbiddenException('Cette invitation a été envoyée à une autre adresse e-mail');
    }

    if (inv.status === 'PENDING' && inv.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { id }, data: { status: 'EXPIRED' } });
      return this.withResponseState({ ...inv, status: 'EXPIRED' });
    }

    return this.withResponseState(inv);
  }

  // ─── Accept invitation ───────────────────────────────────────

  async acceptInvitation(userId: string, token: string) {
    const inv = await this.resolveAndValidate(token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    if (inv.targetEmail !== user.email) {
      throw new ForbiddenException('Cette invitation a été envoyée à une autre adresse e-mail');
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: inv.organizationId } },
    });
    if (existing) throw new ConflictException('Vous êtes déjà membre de cette organisation');

    await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: { userId, organizationId: inv.organizationId, role: inv.role },
      }),
      this.prisma.invitation.update({
        where: { token },
        data:  { status: 'ACCEPTED', respondedAt: new Date(), targetUserId: userId },
      }),
    ]);

    // Notify the inviter
    const org = await this.prisma.organization.findUnique({
      where: { id: inv.organizationId },
      select: { name: true },
    });
    this.notifications.fire({
      recipientId: inv.createdById,
      type:        'INVITE_ACCEPTED',
      title:       `${user.displayName} a accepté votre invitation à ${org?.name}`,
      sourceId:    inv.id,
      sourceType:  'invitation',
    });

    return { message: 'Invitation acceptée avec succès', organizationId: inv.organizationId };
  }

  // ─── Reject invitation ───────────────────────────────────────

  async rejectInvitation(userId: string, token: string) {
    const inv = await this.resolveAndValidate(token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    if (inv.targetEmail !== user.email) {
      throw new ForbiddenException('Cette invitation a été envoyée à une autre adresse e-mail');
    }

    await this.prisma.invitation.update({
      where: { token },
      data:  { status: 'REJECTED', respondedAt: new Date() },
    });

    // Notify the inviter
    const org = await this.prisma.organization.findUnique({
      where: { id: inv.organizationId },
      select: { name: true },
    });
    this.notifications.fire({
      recipientId: inv.createdById,
      type:        'INVITE_REJECTED',
      title:       `${user.displayName} a refusé votre invitation à ${org?.name}`,
      sourceId:    inv.id,
      sourceType:  'invitation',
    });

    return { message: 'Invitation refusée' };
  }

  // ─── Revoke invitation (admin/owner) ─────────────────────────

  async revokeInvitation(userId: string, orgId: string, invitationId: string) {
    await this.requireAdminOrOwner(userId, orgId);

    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId: orgId },
    });
    if (!inv) throw new NotFoundException('Invitation introuvable');
    if (inv.status !== 'PENDING') {
      throw new BadRequestException('Seules les invitations en attente peuvent être révoquées');
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data:  { status: 'REVOKED' },
    });

    return { message: 'Invitation révoquée' };
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private async resolveAndValidate(token: string) {
    const inv = await this.prisma.invitation.findUnique({
      where: { token },
      select: {
        id: true, token: true, organizationId: true, createdById: true,
        targetEmail: true, role: true, status: true, expiresAt: true,
      },
    });
    if (!inv) throw new NotFoundException('Invitation introuvable');
    if (inv.status === 'ACCEPTED') throw new ConflictException('Cette invitation a déjà été acceptée');
    if (inv.status === 'REJECTED') throw new BadRequestException('Cette invitation a déjà été refusée');
    if (inv.status === 'REVOKED')  throw new BadRequestException('Cette invitation a été révoquée');
    if (inv.status === 'EXPIRED' || inv.expiresAt < new Date()) {
      if (inv.status === 'PENDING') {
        await this.prisma.invitation.update({ where: { token }, data: { status: 'EXPIRED' } });
      }
      throw new BadRequestException('Cette invitation a expiré');
    }
    return inv;
  }

  private async requireAdminOrOwner(userId: string, orgId: string) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!m) throw new ForbiddenException('Vous n\'êtes pas membre de cette organisation');
    if (m.role !== MemberRole.OWNER && m.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('Rôle Administrateur ou Propriétaire requis');
    }
    return m;
  }
}
