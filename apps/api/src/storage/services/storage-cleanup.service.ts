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

// Assets PENDING older than this are considered abandoned
const PENDING_EXPIRY_HOURS = 24;

// Maximum assets purged per cycle (avoids timeouts on large batch jobs)
const PURGE_BATCH_SIZE = 100;

// TTL for Redis locks (in seconds).
// Must be longer than the maximum expected execution time of the job.
const LOCK_TTL_PENDING = 120;   // 2 min — fast job
const LOCK_TTL_PURGE   = 600;   // 10 min — slow job (may process many assets)

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

  // ── Job 1: Clean expired PENDING assets ─────────────────
  // Frequency: every hour.
  // Lock: ensures only one instance runs the job at a time.
  @Cron(CronExpression.EVERY_HOUR)
  async cleanExpiredPendingAssets(): Promise<void> {
    const redis = this.redis.getClient();

    // Try to acquire lock (SET NX — only writes if key does not exist)
    const acquired = await redis.set(LOCK_KEY_PENDING, '1', 'EX', LOCK_TTL_PENDING, 'NX');
    if (!acquired) {
      this.logger.debug('cleanExpiredPendingAssets: lock busy, skipping execution.');
      return;
    }

    try {
      this.logger.log('Starting cleanup of expired PENDING assets...');
      const expired = await this.assetService.findExpiredPending(PENDING_EXPIRY_HOURS);

      if (expired.length === 0) {
        this.logger.debug('No expired PENDING assets found.');
        return;
      }

      const ids = expired.map((a) => a.id);
      await this.assetService.hardDelete(ids);

      this.logger.log(`PENDING cleanup: ${expired.length} asset(s) removed from DB.`);
    } catch (error) {
      this.logger.error(
        'Error during PENDING asset cleanup:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      // Always release the lock — even if the job failed
      await redis.del(LOCK_KEY_PENDING);
    }
  }

  // ── Job 2: Purge soft-deleted assets from R2 ──────────────
  // Frequency: daily at 3:00 AM.
  // Only processes assets with deletedAt > 24h ago (grace period for accidental deletes).
  // Lock: ensures only one instance runs the purge at a time.
  @Cron('0 3 * * *')
  async purgeDeletedAssets(): Promise<void> {
    const redis = this.redis.getClient();

    const acquired = await redis.set(LOCK_KEY_PURGE, '1', 'EX', LOCK_TTL_PURGE, 'NX');
    if (!acquired) {
      this.logger.debug('purgeDeletedAssets: lock busy, skipping execution.');
      return;
    }

    try {
      this.logger.log('Starting purge of deleted assets in R2...');
      const toDelete = await this.assetService.findDeletedForPurge();

      if (toDelete.length === 0) {
        this.logger.debug('No assets pending purge in R2.');
        return;
      }

      const purgedIds: string[] = [];
      const batch = toDelete.slice(0, PURGE_BATCH_SIZE);

      for (const asset of batch) {
        try {
          await this.objectService.deleteObject(asset.key);
          purgedIds.push(asset.id);
        } catch (error) {
          this.logger.warn(`Failed to delete key="${asset.key}" from R2: ${String(error)}`);
        }
      }

      if (purgedIds.length > 0) {
        await this.assetService.hardDelete(purgedIds);
        this.logger.log(
          `Purge complete: ${purgedIds.length}/${batch.length} asset(s) deleted.`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Error during asset purge:',
        error instanceof Error ? error.message : error,
      );
    } finally {
      await redis.del(LOCK_KEY_PURGE);
    }
  }
}
