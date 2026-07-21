import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSkillCategoryDto } from './dto/create-skill-category.dto';
import { AddUserSkillDto } from './dto/add-user-skill.dto';
import { SearchUsersDto } from './dto/search-users.dto';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Categorías ──────────────────────────────────────────────

  async getCategories() {
    return this.prisma.skillCategory.findMany({ orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  }

  async createCategory(dto: CreateSkillCategoryDto) {
    const exists = await this.prisma.skillCategory.findUnique({ where: { name: dto.name } });
    if (exists) throw new ConflictException('Skill category already exists');
    return this.prisma.skillCategory.create({ data: dto });
  }

  async deleteCategory(id: string) {
    const cat = await this.prisma.skillCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.prisma.skillCategory.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  // ─── Habilidades del usuario ──────────────────────────────────

  async getUserSkills(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId, isActive: true },
      select: { id: true, displayName: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.prisma.userSkill.findMany({
      where: { userId: targetUserId },
      include: { skillCategory: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addSkill(userId: string, dto: AddUserSkillDto) {
    const cat = await this.prisma.skillCategory.findUnique({ where: { id: dto.skillCategoryId } });
    if (!cat) throw new NotFoundException('Skill category not found');

    const existing = await this.prisma.userSkill.findUnique({
      where: { userId_skillCategoryId: { userId, skillCategoryId: dto.skillCategoryId } },
    });
    if (existing) throw new ConflictException('You already have this skill');

    return this.prisma.userSkill.create({
      data: {
        userId,
        skillCategoryId: dto.skillCategoryId,
        expertiseLevel:  dto.expertiseLevel ?? 'INTERMEDIATE',
        yearsExp:        dto.yearsExp,
      },
      include: { skillCategory: true },
    });
  }

  async removeSkill(userId: string, skillId: string) {
    const skill = await this.prisma.userSkill.findFirst({
      where: { id: skillId, userId },
    });
    if (!skill) throw new NotFoundException('Skill not found or not yours');
    await this.prisma.userSkill.delete({ where: { id: skillId } });
    return { message: 'Skill removed' };
  }

  // ─── Búsqueda de usuarios ─────────────────────────────────────

  async searchUsers(query: SearchUsersDto) {
    const { skill, city, orgId, q, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { isActive: true };

    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (q)    where.displayName = { contains: q, mode: 'insensitive' };

    if (skill) {
      where.skills = {
        some: {
          skillCategory: {
            name: { contains: skill, mode: 'insensitive' },
          },
        },
      };
    }

    if (orgId) {
      where.memberships = { some: { organizationId: orgId } };
    }

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          displayName: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          city: true,
          country: true,
          bio: true,
          skills: {
            include: { skillCategory: { select: { id: true, name: true, type: true } } },
          },
        },
        orderBy: { displayName: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  // ─── Perfil público ───────────────────────────────────────────

  async getPublicProfile(targetUserId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: targetUserId, isActive: true },
      select: {
        id: true,
        displayName: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        bannerUrl: true,
        bio: true,
        city: true,
        country: true,
        createdAt: true,
        skills: {
          include: { skillCategory: { select: { id: true, name: true, type: true } } },
        },
        memberships: {
          include: {
            organization: { select: { id: true, name: true, slug: true, logoUrl: true } },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
