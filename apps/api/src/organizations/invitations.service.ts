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

  // ─── Send invitation ─────────────────────────────────────────

  async sendInvitation(senderId: string, orgId: string, dto: SendInvitationDto) {
    await this.requireAdminOrOwner(senderId, orgId);

    const org = await this.prisma.organization.findFirst({
      where: { id: orgId, isActive: true },
      select: { id: true, name: true, logoUrl: true },
    });
    if (!org) throw new NotFoundException('Organization not found');

    // Prevent duplicate pending invitation to the same email
    const duplicate = await this.prisma.invitation.findFirst({
      where: { organizationId: orgId, targetEmail: dto.email, status: 'PENDING' },
    });
    if (duplicate) {
      throw new ConflictException('There is already a pending invitation for this email');
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
        throw new ConflictException('This user is already a member of this organization');
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
        title:       `${sender?.displayName ?? 'Alguien'} te invita a unirte a ${org.name}`,
        body:        dto.personalMessage,
        sourceId:    invitation.id,
        sourceType:  'invitation',
      });
    }

    return { ...invitation, inviteUrl };
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
    if (!user) throw new NotFoundException('User not found');

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
    if (!inv) throw new NotFoundException('Invitation not found');

    if (inv.status === 'PENDING' && inv.expiresAt < new Date()) {
      await this.prisma.invitation.update({ where: { token }, data: { status: 'EXPIRED' } });
      throw new BadRequestException('This invitation has expired');
    }

    return inv;
  }

  // ─── Accept invitation ───────────────────────────────────────

  async acceptInvitation(userId: string, token: string) {
    const inv = await this.resolveAndValidate(token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (inv.targetEmail !== user.email) {
      throw new ForbiddenException('This invitation was sent to a different email address');
    }

    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: inv.organizationId } },
    });
    if (existing) throw new ConflictException('You are already a member of this organization');

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
      title:       `${user.displayName} aceptó tu invitación a ${org?.name}`,
      sourceId:    inv.id,
      sourceType:  'invitation',
    });

    return { message: 'Invitation accepted successfully', organizationId: inv.organizationId };
  }

  // ─── Reject invitation ───────────────────────────────────────

  async rejectInvitation(userId: string, token: string) {
    const inv = await this.resolveAndValidate(token);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    if (inv.targetEmail !== user.email) {
      throw new ForbiddenException('This invitation was sent to a different email address');
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
      title:       `${user.displayName} rechazó tu invitación a ${org?.name}`,
      sourceId:    inv.id,
      sourceType:  'invitation',
    });

    return { message: 'Invitation rejected' };
  }

  // ─── Revoke invitation (admin/owner) ─────────────────────────

  async revokeInvitation(userId: string, orgId: string, invitationId: string) {
    await this.requireAdminOrOwner(userId, orgId);

    const inv = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId: orgId },
    });
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.status !== 'PENDING') {
      throw new BadRequestException('Only pending invitations can be revoked');
    }

    await this.prisma.invitation.update({
      where: { id: invitationId },
      data:  { status: 'REVOKED' },
    });

    return { message: 'Invitation revoked' };
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
    if (!inv) throw new NotFoundException('Invitation not found');
    if (inv.status === 'ACCEPTED') throw new ConflictException('This invitation has already been accepted');
    if (inv.status === 'REJECTED') throw new BadRequestException('This invitation has already been rejected');
    if (inv.status === 'REVOKED')  throw new BadRequestException('This invitation has been revoked');
    if (inv.status === 'EXPIRED' || inv.expiresAt < new Date()) {
      if (inv.status === 'PENDING') {
        await this.prisma.invitation.update({ where: { token }, data: { status: 'EXPIRED' } });
      }
      throw new BadRequestException('This invitation has expired');
    }
    return inv;
  }

  private async requireAdminOrOwner(userId: string, orgId: string) {
    const m = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
    });
    if (!m) throw new ForbiddenException('You are not a member of this organization');
    if (m.role !== MemberRole.OWNER && m.role !== MemberRole.ADMIN) {
      throw new ForbiddenException('Admin or Owner role required');
    }
    return m;
  }
}
