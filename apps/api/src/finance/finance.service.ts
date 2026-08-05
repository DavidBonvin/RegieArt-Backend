import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MemberRole } from '@regieart/types';
import { CreateFinanceCategoryDto } from './dto/create-finance-category.dto';
import { CreateFinanceEntryDto } from './dto/create-finance-entry.dto';
import { UpdateFinanceEntryDto } from './dto/update-finance-entry.dto';
import { CreatePerDiemDto } from './dto/create-per-diem.dto';
import { QueryFinanceDto } from './dto/query-finance.dto';

const ENTRY_NOT_FOUND = 'Entry not found';

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Categories ──────────────────────────────────────────────

  async createCategory(userId: string, dto: CreateFinanceCategoryDto) {
    await this.requireAdminOrOwner(userId, dto.orgId);
    const exists = await this.prisma.financeCategory.findFirst({
      where: { orgId: dto.orgId, name: dto.name, type: dto.type },
    });
    if (exists) throw new ConflictException('Category already exists');
    return this.prisma.financeCategory.create({ data: dto });
  }

  async getCategories(userId: string, orgId: string) {
    await this.requireMembership(userId, orgId);
    return this.prisma.financeCategory.findMany({
      where: { orgId },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async deleteCategory(userId: string, id: string) {
    const cat = await this.prisma.financeCategory.findUnique({ where: { id } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.requireAdminOrOwner(userId, cat.orgId);
    await this.prisma.financeCategory.delete({ where: { id } });
    return { message: 'Category deleted' };
  }

  // ─── Entries (Expenses / Income) ────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createEntry(userId: string, dto: CreateFinanceEntryDto): Promise<any> {
    await this.requireMembership(userId, dto.orgId);
    return this.prisma.financeEntry.create({
      data: {
        orgId:       dto.orgId,
        eventId:     dto.eventId,
        categoryId:  dto.categoryId,
        type:        dto.type,
        amount:      dto.amount,
        currency:    dto.currency ?? 'EUR',
        description: dto.description,
        proofAssetId:dto.proofAssetId,
        date:        new Date(dto.date),
        createdById: userId,
      },
      include: { category: true, createdBy: { select: { id: true, displayName: true } } },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEntries(userId: string, query: QueryFinanceDto): Promise<any> {
    const { orgId, eventId, type, status, from, to, page = 1, limit = 20 } = query;
    if (orgId) await this.requireMembership(userId, orgId);

    const where = {
      ...(orgId   && { orgId }),
      ...(eventId && { eventId }),
      ...(type    && { type }),
      ...(status  && { status }),
      ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
    };

    const skip = (page - 1) * limit;
    const [entries, total] = await this.prisma.$transaction([
      this.prisma.financeEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { date: 'desc' },
        include: {
          category: true,
          createdBy:  { select: { id: true, displayName: true } },
          approvedBy: { select: { id: true, displayName: true } },
        },
      }),
      this.prisma.financeEntry.count({ where }),
    ]);
    return { entries, total, page, limit };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getEntry(userId: string, id: string): Promise<any> {
    const entry = await this.prisma.financeEntry.findUnique({
      where: { id },
      include: {
        category:  true,
        createdBy:  { select: { id: true, displayName: true } },
        approvedBy: { select: { id: true, displayName: true } },
        event:      { select: { id: true, title: true } },
      },
    });
    if (!entry) throw new NotFoundException(ENTRY_NOT_FOUND);
    await this.requireMembership(userId, entry.orgId);
    return entry;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async updateEntry(userId: string, id: string, dto: UpdateFinanceEntryDto): Promise<any> {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(ENTRY_NOT_FOUND);
    if (entry.createdById !== userId) {
      await this.requireAdminOrOwner(userId, entry.orgId);
    }
    const { date: dateStr, ...dtoRest } = dto;
    const data = {
      ...dtoRest,
      ...(dateStr && { date: new Date(dateStr) }),
    };
    return this.prisma.financeEntry.update({ where: { id }, data });
  }

  async deleteEntry(userId: string, id: string) {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(ENTRY_NOT_FOUND);
    if (entry.createdById !== userId) await this.requireAdminOrOwner(userId, entry.orgId);
    await this.prisma.financeEntry.delete({ where: { id } });
    return { message: 'Entry deleted' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async approveEntry(approverId: string, id: string): Promise<any> {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(ENTRY_NOT_FOUND);
    await this.requireAdminOrOwner(approverId, entry.orgId);

    const approver = await this.prisma.user.findUnique({
      where: { id: approverId }, select: { displayName: true },
    });

    const updated = await this.prisma.financeEntry.update({
      where: { id },
      data: { status: 'APPROVED', approvedById: approverId, paidAt: new Date() },
    });

    this.notifications.fire({
      recipientId: entry.createdById,
      type:        'EXPENSE_APPROVED',
      title:       'Gasto aprobado',
      body:        `${approver?.displayName} aprobó tu gasto de ${entry.amount} ${entry.currency}`,
      sourceId:    id,
      sourceType:  'finance_entry',
    });

    return updated;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async rejectEntry(approverId: string, id: string, reason?: string): Promise<any> {
    const entry = await this.prisma.financeEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException(ENTRY_NOT_FOUND);
    await this.requireAdminOrOwner(approverId, entry.orgId);

    const approver = await this.prisma.user.findUnique({
      where: { id: approverId }, select: { displayName: true },
    });

    const updated = await this.prisma.financeEntry.update({
      where: { id },
      data: { status: 'REJECTED', approvedById: approverId, description: reason ?? entry.description },
    });

    this.notifications.fire({
      recipientId: entry.createdById,
      type:        'EXPENSE_REJECTED',
      title:       'Gasto rechazado',
      body:        `${approver?.displayName} rechazó tu gasto${reason ? ': ' + reason : ''}`,
      sourceId:    id,
      sourceType:  'finance_entry',
    });

    return updated;
  }

  // ─── Per Diem ────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async createPerDiem(userId: string, dto: CreatePerDiemDto): Promise<any> {
    await this.requireAdminOrOwner(userId, dto.orgId);
    return this.prisma.perDiemPayout.create({
      data: {
        orgId:       dto.orgId,
        eventId:     dto.eventId,
        userId:      dto.userId,
        amount:      dto.amount,
        currency:    dto.currency ?? 'EUR',
        description: dto.description,
        createdById: userId,
      },
      include: { user: { select: { id: true, displayName: true } } },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getPerDiems(userId: string, orgId: string, eventId?: string): Promise<any> {
    await this.requireMembership(userId, orgId);
    return this.prisma.perDiemPayout.findMany({
      where: { orgId, ...(eventId && { eventId }) },
      include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async markPerDiemPaid(adminId: string, id: string): Promise<any> {
    const pd = await this.prisma.perDiemPayout.findUnique({ where: { id } });
    if (!pd) throw new NotFoundException('Per diem not found');
    await this.requireAdminOrOwner(adminId, pd.orgId);
    return this.prisma.perDiemPayout.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }

  // ─── Reports ────────────────────────────────────────────────

  async getReport(userId: string, orgId: string, from?: string, to?: string) {
    await this.requireMembership(userId, orgId);

    const where = {
      orgId,
      status: 'APPROVED' as const,
      ...(from || to ? { date: { ...(from && { gte: new Date(from) }), ...(to && { lte: new Date(to) }) } } : {}),
    };

    const entries = await this.prisma.financeEntry.findMany({
      where,
      include: { category: true },
    });

    let totalIncome = 0;
    let totalExpense = 0;
    type CategoryReport = { name: string; type: string; total: number; count: number };
    const byCategory: Record<string, CategoryReport> = {};

    for (const e of entries) {
      const amt = parseFloat(e.amount.toString());
      if (e.type === 'INCOME') totalIncome += amt;
      else totalExpense += amt;

      const key = e.category?.name ?? 'Sin categoría';
      if (!byCategory[key]) byCategory[key] = { name: key, type: e.type, total: 0, count: 0 };
      byCategory[key].total += amt;
      byCategory[key].count++;
    }

    return {
      period: { from: from ?? null, to: to ?? null },
      summary: {
        totalIncome: +totalIncome.toFixed(2),
        totalExpense: +totalExpense.toFixed(2),
        balance: +(totalIncome - totalExpense).toFixed(2),
      },
      byCategory: Object.values(byCategory).sort((a, b) => b.total - a.total),
    };
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


