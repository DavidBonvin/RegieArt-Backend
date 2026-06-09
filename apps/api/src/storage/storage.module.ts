// ============================================================
// StorageModule — Registro de toda la infraestructura de almacenamiento.
//
// Providers registrados en orden de dependencia:
//   1. Providers de infraestructura: S3Client, bucket, CDN URL
//   2. Servicios especializados (usan los providers de infraestructura)
//   3. Fachada StorageService (usa los servicios especializados)
//
// Solo se exporta StorageService (la fachada) — los servicios internos
// son detalles de implementación que ningún módulo externo debe conocer.
// ============================================================

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { s3BucketProvider, s3CdnUrlProvider, s3ClientProvider } from './providers/s3-client.provider';
import { StorageMembershipService } from './services/storage-membership.service';
import { StoragePresignedService } from './services/storage-presigned.service';
import { StorageObjectService } from './services/storage-object.service';
import { StorageCdnService } from './services/storage-cdn.service';
import { StorageAssetService } from './services/storage-asset.service';
import { StorageMultipartService } from './services/storage-multipart.service';
import { StorageCleanupService } from './services/storage-cleanup.service';
import { StorageController } from './storage.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [
    // ScheduleModule habilita los decoradores @Cron del StorageCleanupService
    ScheduleModule.forRoot(),
  ],
  controllers: [StorageController],
  providers: [
    // ─── Infraestructura S3 (singletons compartidos por todos los servicios)
    s3ClientProvider,
    s3BucketProvider,
    s3CdnUrlProvider,

    // ─── Capa de datos (DB)
    StorageAssetService,        // CRUD sobre la tabla assets de Postgres

    // ─── Servicios especializados (responsabilidad única cada uno)
    StorageMembershipService,   // Verificación de membresía con caché Redis
    StoragePresignedService,    // Firma de URLs de subida y descarga + caché Redis
    StorageObjectService,       // Confirmación, eliminación y listado de objetos
    StorageCdnService,          // URLs públicas y transformaciones de imagen
    StorageMultipartService,    // Subida de archivos grandes en partes (> 50 MB)
    StorageCleanupService,      // Jobs automáticos de limpieza (cron)

    // ─── Fachada pública
    StorageService,
  ],
  // Solo exportamos la fachada — encapsulamos los detalles internos
  exports: [StorageService],
})
export class StorageModule {}

