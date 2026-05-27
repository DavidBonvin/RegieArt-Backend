import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { MemberRole } from '@regieart/types';
import slugify from 'slugify';

@Injectable()
export class OrganizationsService {
  constructor(private prisma: PrismaService) {}

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

    return this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role: updateDto.role },
    });
  }
}
