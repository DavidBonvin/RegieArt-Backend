// ============================================================
// StorageMembershipService — Verificación de acceso a organizaciones.
//
// Responsabilidad única: determinar si un userId pertenece a una
// organización antes de que el StoragePresignedService firme una URL.
//
// Patrón Cache-Aside con Redis:
//   1. Busca en caché → positivo: permite, negativo: rechaza
//   2. Cache miss → consulta la DB → escribe en caché → evalúa
//
// TTL de 5 minutos: si un miembro es expulsado, el caché expira
// sólo después de ese tiempo. Estándar aceptable en la industria.
// ============================================================

import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

// 5 minutos — balance entre consistencia y rendimiento (evita golpear la DB)
const MEMBERSHIP_CACHE_TTL_SECONDS = 300;

@Injectable()
export class StorageMembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async assertMembership(userId: string, orgId: string): Promise<void> {
    const cacheKey = `storage:membership:${userId}:${orgId}`;
    const client = this.redis.getClient();

    try {
      const cached = await client.get(cacheKey);

      if (cached === '1') return;

      if (cached === '0') {
        throw new ForbiddenException(
          'Vous n\'avez pas accès aux ressources de cette organisation.',
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
    }

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      select: { id: true },
    });

    const isMember = membership !== null;

    client.set(cacheKey, isMember ? '1' : '0', 'EX', MEMBERSHIP_CACHE_TTL_SECONDS).catch(() => {});

    if (!isMember) {
      throw new ForbiddenException(
        'Vous n\'avez pas accès aux ressources de cette organisation.',
      );
    }
  }
}
