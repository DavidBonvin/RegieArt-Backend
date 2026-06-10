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

  // Lanza ForbiddenException si el usuario no es miembro activo de la organización.
  // Es seguro llamarlo múltiples veces — el caché absorbe las consultas repetidas.
  async assertMembership(userId: string, orgId: string): Promise<void> {
    const cacheKey = `storage:membership:${userId}:${orgId}`;
    const client = this.redis.getClient();

    // Redis is optional — if unavailable, fall through to DB
    try {
      const cached = await client.get(cacheKey);

      if (cached === '1') return;

      if (cached === '0') {
        throw new ForbiddenException(
          'No tienes acceso a los recursos de esta organización.',
        );
      }
    } catch (err) {
      // Re-throw business exceptions (ForbiddenException), swallow Redis errors
      if (err instanceof ForbiddenException) throw err;
    }

    // Cache miss or Redis unavailable: query DB
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      select: { id: true },
    });

    const isMember = membership !== null;

    // Write to cache only if Redis is available (fire-and-forget)
    client.set(cacheKey, isMember ? '1' : '0', 'EX', MEMBERSHIP_CACHE_TTL_SECONDS).catch(() => {});

    if (!isMember) {
      throw new ForbiddenException(
        'No tienes acceso a los recursos de esta organización.',
      );
    }
  }
}
