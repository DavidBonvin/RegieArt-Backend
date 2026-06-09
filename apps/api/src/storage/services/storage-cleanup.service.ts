// ============================================================
// StorageCleanupService — Jobs automáticos de limpieza del sistema de storage.
//
// Ejecuta dos tareas periódicas con distributed lock Redis:
//   1. Cada hora: elimina Assets PENDING expirados (URL generada, nunca subida)
//   2. Cada noche: purga en R2 los objetos soft-deleted de la DB
//
// Distributed lock:
//   Usa Redis SET NX (set if not exists) para garantizar que solo una instancia
//   del servicio ejecuta cada job en un momento dado. Crítico en deploys
//   multi-instancia (Railway, Kubernetes, etc.).
//
//   Patrón: SET lock_key "1" NX EX ttl_segundos
//   → Si devuelve "OK": el lock se adquirió (somos los únicos ejecutando)
//   → Si devuelve null: otro proceso tiene el lock (skip)
//   → DEL lock_key en finally: siempre liberar, aunque falle la tarea
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StorageObjectService } from './storage-object.service';
import { StorageAssetService } from './storage-asset.service';
import { RedisService } from '../../redis/redis.service';

// Assets PENDING más viejos que esto se consideran abandonados
const PENDING_EXPIRY_HOURS = 24;

// Máximo de assets purgados por ciclo (evita timeouts en jobs de batch grandes)
const PURGE_BATCH_SIZE = 100;

// TTL de los locks de Redis (en segundos).
// Debe ser mayor que el tiempo máximo esperado de ejecución del job.
const LOCK_TTL_PENDING = 120;   // 2 min — job rápido
const LOCK_TTL_PURGE   = 600;   // 10 min — job lento (puede procesar muchos assets)

const LOCK_KEY_PENDING = 'storage:lock:cleanup-pending';
const LOCK_KEY_PURGE   = 'storage:lock:purge-deleted';

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly objectService: StorageObjectService,
    private readonly assetService: StorageAssetService,
    private readonly redis: RedisService,
  ) {}

  // ── Job 1: Limpiar Assets PENDING expirados ────────────────
  // Frecuencia: cada hora.
  // Lock: garantiza que solo una instancia ejecuta el job a la vez.
  @Cron(CronExpression.EVERY_HOUR)
  async cleanExpiredPendingAssets(): Promise<void> {
    const redis = this.redis.getClient();

    // Intentar adquirir lock (SET NX — solo escribe si no existe)
    const acquired = await redis.set(LOCK_KEY_PENDING, '1', 'EX', LOCK_TTL_PENDING, 'NX');
    if (!acquired) {
      this.logger.debug('cleanExpiredPendingAssets: lock ocupado, saltando ejecución.');
      return;
    }

    try {
      this.logger.log('Iniciando limpieza de assets PENDING expirados...');
      const expired = await this.assetService.findExpiredPending(PENDING_EXPIRY_HOURS);

      if (expired.length === 0) {
        this.logger.debug('No hay assets PENDING expirados.');
        return;
      }

      const ids = expired.map((a) => a.id);
      await this.assetService.hardDelete(ids);

      this.logger.log(`Limpieza PENDING: ${expired.length} asset(s) eliminados de la DB.`);
    } catch (error) {
      this.logger.error(
        'Error en limpieza de assets PENDING:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      // Liberar el lock siempre — incluso si el job falló
      await redis.del(LOCK_KEY_PENDING);
    }
  }

  // ── Job 2: Purgar assets soft-deleted de R2 ────────────────
  // Frecuencia: cada día a las 3:00 AM.
  // Lock: garantiza que solo una instancia purga a la vez.
  @Cron('0 3 * * *')
  async purgeDeletedAssets(): Promise<void> {
    const redis = this.redis.getClient();

    const acquired = await redis.set(LOCK_KEY_PURGE, '1', 'EX', LOCK_TTL_PURGE, 'NX');
    if (!acquired) {
      this.logger.debug('purgeDeletedAssets: lock ocupado, saltando ejecución.');
      return;
    }

    try {
      this.logger.log('Iniciando purga de assets eliminados en R2...');
      const toDelete = await this.assetService.findDeletedForPurge();

      if (toDelete.length === 0) {
        this.logger.debug('No hay assets pendientes de purga en R2.');
        return;
      }

      const purgedIds: string[] = [];
      const batch = toDelete.slice(0, PURGE_BATCH_SIZE);

      for (const asset of batch) {
        try {
          await this.objectService.deleteObject(asset.key);
          purgedIds.push(asset.id);
        } catch (error) {
          this.logger.warn(`No se pudo borrar key="${asset.key}" de R2: ${String(error)}`);
        }
      }

      if (purgedIds.length > 0) {
        await this.assetService.hardDelete(purgedIds);
        this.logger.log(
          `Purga completada: ${purgedIds.length}/${batch.length} asset(s) eliminados.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Error en purga de assets:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      await redis.del(LOCK_KEY_PURGE);
    }
  }
}
