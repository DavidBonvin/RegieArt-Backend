import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';
import { MemberRole } from '@regieart/types';
import { NotificationsService } from '../notifications/notifications.service';
import slugify from 'slugify';

@Injectable()
export class OrganizationsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async create(userId: string, createDto: CreateOrganizationDto) {
    const slug = slugify(createDto.name, { lower: true, strict: true });
    
    // Add unique suffix if slug exists
    const existing = await this.prisma.organization.findUnique({ where: { slug } });
    const finalSlug = existing ? `${slug}-${Date.now()}` : slug;

    return this.prisma.organization.create({
      data: {
        ...createDto,
        slug: finalSlug,
        members: {
          create: {
            userId,
            role: MemberRole.OWNER,
          },
        },
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.organization.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
    });
  }

  async findOne(userId: string, id: string) {
    const org = await this.prisma.organization.findFirst({
      where: {
        id,
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return org;
  }

  async updateMemberRole(userId: string, orgId: string, memberId: string, updateDto: UpdateMemberRoleDto) {
    // Check if current user is owner/admin
    const membership = await this.prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: orgId,
        },
      },
    });

    if (!membership || (membership.role !== MemberRole.OWNER && membership.role !== MemberRole.ADMIN)) {
      throw new ForbiddenException('Not enough permissions');
    }

    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: updateDto.role },
      include: { user: { select: { id: true, displayName: true } }, organization: { select: { name: true } } },
    });

    this.notifications.fire({
      recipientId: updated.user.id,
      type:        'ROLE_CHANGED',
      title:       `Rol actualizado en ${updated.organization.name}`,
      body:        `Tu nuevo rol es: ${updateDto.role}`,
      sourceId:    orgId,
      sourceType:  'organization',
    });

    return updated;
  }

  // ─── UPDATE ──────────────────────────────────────────────────

  async update(userId: string, orgId: string, updateDto: UpdateOrganizationDto) {
    await this.requireAdminOrOwner(userId, orgId);
    return this.prisma.organization.update({
      where: { id: orgId },
      data: updateDto,
    });
  }

  // ─── SOFT DELETE ─────────────────────────────────────────────

  async remove(userId: string, orgId: string) {
    await this.requireOwner(userId, orgId);
    return this.prisma.organization.update({
      where: { id: orgId },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  // ─── MEMBERS ─────────────────────────────────────────────────

  async getMembers(userId: string, orgId: string) {
    await this.requireMembership(userId, orgId);
    return this.prisma.organizationMember.findMany({
      where: { organizationId: orgId },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            firstName: true,
            lastName: true,
            email: true,
            avatarUrl: true,
            phone: true,
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  async removeMember(currentUserId: string, orgId: string, targetUserId: string) {
    // A user can leave voluntarily, or an admin/owner can remove someone
    const currentMembership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: currentUserId, organizationId: orgId } },
    });

    const isSelf = currentUserId === targetUserId;
    const isAdminOrOwner =
      currentMembership?.role === MemberRole.OWNER ||
      currentMembership?.role === MemberRole.ADMIN;

    if (!isSelf && !isAdminOrOwner) {
      throw new ForbiddenException('Not enough permissions to remove this member');
    }

    // Cannot remove the last owner
    if (isSelf && currentMembership?.role === MemberRole.OWNER) {
      const ownerCount = await this.prisma.organizationMember.count({
        where: { organizationId: orgId, role: MemberRole.OWNER },
      });
      if (ownerCount <= 1) {
        throw new BadRequestException('Cannot leave: you are the last owner. Transfer ownership first.');
      }
    }

    const target = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId: orgId } },
    });
    if (!target) throw new NotFoundException('Member not found in this organization');

    await this.prisma.organizationMember.delete({ where: { id: target.id } });
    return { message: 'Member removed successfully' };
  }

  // ─── INVITE LINKS ────────────────────────────────────────────

  async createInviteLink(userId: string, orgId: string, dto: CreateInviteLinkDto) {
    await this.requireAdminOrOwner(userId, orgId);

    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días por defecto

    return this.prisma.inviteLink.create({
      data: {
        organizationId: orgId,
        createdById: userId,
        role: dto.role ?? MemberRole.MEMBER,
        expiresAt,
      },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        createdAt: true,
      },
    });
  }

  async getInviteLinks(userId: string, orgId: string) {
    await this.requireAdminOrOwner(userId, orgId);
    return this.prisma.inviteLink.findMany({
      where: {
        organizationId: orgId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        token: true,
        role: true,
        expiresAt: true,
        createdAt: true,
        createdBy: { select: { id: true, displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInviteLink(userId: string, orgId: string, linkId: string) {
    await this.requireAdminOrOwner(userId, orgId);
    const link = await this.prisma.inviteLink.findFirst({
      where: { id: linkId, organizationId: orgId },
    });
    if (!link) throw new NotFoundException('Invite link not found');

    await this.prisma.inviteLink.delete({ where: { id: linkId } });
    return { message: 'Invite link revoked' };
  }

  async joinByToken(userId: string, token: string) {
    const link = await this.prisma.inviteLink.findUnique({ where: { token } });

    if (!link) throw new NotFoundException('Invalid invite token');
    if (link.usedAt) throw new BadRequestException('This invite link has already been used');
    if (link.expiresAt < new Date()) throw new BadRequestException('This invite link has expired');

    // Check if already a member
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: link.organizationId } },
    });
    if (existing) throw new ConflictException('You are already a member of this organization');

    const [member] = await this.prisma.$transaction([
      this.prisma.organizationMember.create({
        data: { userId, organizationId: link.organizationId, role: link.role },
      }),
      this.prisma.inviteLink.update({
        where: { id: link.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Notificar a todos los ADMIN/OWNER de la org
    const admins = await this.prisma.organizationMember.findMany({
      where: {
        organizationId: link.organizationId,
        role: { in: [MemberRole.OWNER, MemberRole.ADMIN] },
        userId: { not: userId },
      },
      select: { userId: true },
    });
    const joiner = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    const org    = await this.prisma.organization.findUnique({ where: { id: link.organizationId }, select: { name: true } });
    this.notifications.fireBulk(admins.map(a => ({
      recipientId: a.userId,
      type:        'INVITE_ACCEPTED' as const,
      title:       `${joiner?.displayName ?? 'Alguien'} se unió a ${org?.name}`,
      sourceId:    link.organizationId,
      sourceType:  'organization',
    })));

    return member;
  }

  // ─── HELPERS PRIVADOS ────────────────────────────────────────

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

  private async requireOwner(userId: string, orgId: string) {
    const m = await this.requireMembership(userId, orgId);
    if (m.role !== MemberRole.OWNER) {
      throw new ForbiddenException('Owner role required');
    }
    return m;
  }
}
