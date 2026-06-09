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

    const cached = await client.get(cacheKey);

    // Caché positivo: el usuario es miembro confirmado → no tocar la DB
    if (cached === '1') return;

    // Caché negativo: ya sabemos que NO es miembro → rechazar de inmediato
    if (cached === '0') {
      throw new ForbiddenException(
        'No tienes acceso a los recursos de esta organización.',
      );
    }

    // Cache miss: consultar la DB y escribir el resultado para próximas llamadas
    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId: orgId } },
      select: { id: true }, // Solo verificamos existencia, no necesitamos los datos
    });

    const isMember = membership !== null;

    // Persistir resultado con TTL — EX = tiempo de expiración en segundos
    await client.set(cacheKey, isMember ? '1' : '0', 'EX', MEMBERSHIP_CACHE_TTL_SECONDS);

    if (!isMember) {
      throw new ForbiddenException(
        'No tienes acceso a los recursos de esta organización.',
      );
    }
  }
}
