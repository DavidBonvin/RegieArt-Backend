import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MemberRole } from '@regieart/types';
import { UpsertEventFinanceDto } from '../dto/upsert-event-finance.dto';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async getFinance(userId: string, eventId: string) {
    const event = await this.getEventOrFail(eventId);
    await this.requireMembership(userId, event.orgId);

    // Returns null if not yet created
    return this.prisma.eventFinance.findUnique({
      where: { eventId },
    });
  }

  async upsertFinance(userId: string, eventId: string, dto: UpsertEventFinanceDto) {
    const event = await this.getEventOrFail(eventId);
    await this.requireAdminOrOwner(userId, event.orgId);

    const data = {
      ...(dto.cacheTotal     !== undefined && { cacheTotal:     dto.cacheTotal }),
      ...(dto.perDiemAmount  !== undefined && { perDiemAmount:  dto.perDiemAmount }),
      ...(dto.currency       !== undefined && { currency:       dto.currency }),
      ...(dto.paymentNotes   !== undefined && { paymentNotes:   dto.paymentNotes }),
      ...(dto.invoiceAssetId !== undefined && { invoiceAssetId: dto.invoiceAssetId }),
      // Cuando se marca como pagado, registrar el timestamp
      ...(dto.isPaid === true  && { isPaid: true,  paidAt: new Date() }),
      ...(dto.isPaid === false && { isPaid: false, paidAt: null }),
    };

    return this.prisma.eventFinance.upsert({
      where:  { eventId },
      create: { eventId, ...data },
      update: data,
    });
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
