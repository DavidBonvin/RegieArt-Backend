// ============================================================
// StorageService — Fachada pública del módulo de almacenamiento.
//
// Único punto de entrada para el controller y módulos externos.
// Nadie fuera de este módulo conoce los servicios internos.
// ============================================================

import { Injectable, NotFoundException } from '@nestjs/common';

import { AssetType } from './constants/upload-policies';
import { CreatePresignedUrlDto } from './dto/create-presigned-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';
import { SearchAssetsDto } from './dto/search-assets.dto';
import { InitiateMultipartDto, CompleteMultipartDto, AbortMultipartDto } from './dto/multipart.dto';
import { StoragePresignedService } from './services/storage-presigned.service';
import { StorageObjectService } from './services/storage-object.service';
import { StorageCdnService } from './services/storage-cdn.service';
import { StorageMembershipService } from './services/storage-membership.service';
import { StorageAssetService } from './services/storage-asset.service';
import { StorageMultipartService } from './services/storage-multipart.service';
import { PrismaService } from '../prisma/prisma.service';

export { PresignedUploadResponse } from './services/storage-presigned.service';
export { ImageResizeOptions } from './services/storage-cdn.service';
export { AssetResponse } from './services/storage-asset.service';

@Injectable()
export class StorageService {
  constructor(
    private readonly presigned: StoragePresignedService,
    private readonly object: StorageObjectService,
    private readonly cdn: StorageCdnService,
    private readonly membership: StorageMembershipService,
    private readonly assetService: StorageAssetService,
    private readonly multipart: StorageMultipartService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Subida ────────────────────────────────────────────────
  generateUploadPresignedUrl(userId: string, dto: CreatePresignedUrlDto) {
    return this.presigned.generateUploadUrl(userId, dto);
  }

  // ── Descarga ──────────────────────────────────────────────
  generateDownloadPresignedUrl(userId: string, key: string) {
    return this.presigned.generateDownloadUrl(userId, key);
  }

  // ── Confirmación ──────────────────────────────────────────
  confirmUpload(userId: string, dto: ConfirmUploadDto) {
    return this.object.confirmUpload(userId, dto);
  }

  // ── Gestión de objetos en R2 ──────────────────────────────
  deleteObject(key: string) {
    return this.object.deleteObject(key);
  }

  listObjects(userId: string, prefix: string) {
    return this.object.listObjects(userId, prefix);
  }

  // ── CDN ───────────────────────────────────────────────────
  getPublicUrl(key: string) {
    return this.cdn.getPublicUrl(key);
  }

  getResizedImageUrl(key: string, options: { width?: number; height?: number; fit?: 'cover' | 'contain' | 'scale-down'; format?: 'webp' | 'avif' | 'jpeg' }) {
    return this.cdn.getResizedImageUrl(key, options);
  }

  // ── Membresía ─────────────────────────────────────────────
  assertOrgMembership(userId: string, orgId: string) {
    return this.membership.assertMembership(userId, orgId);
  }

  // ── Assets (metadata en DB) ───────────────────────────────
  getAsset(id: string) {
    return this.assetService.findById(id);
  }

  // Obtiene la URL de descarga de un asset usando solo su ID (sin exponer la key interna)
  async getAssetDownloadUrl(userId: string, assetId: string): Promise<string> {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    const { key } = await this.assetService.assertCanDownload(assetId, userId, orgIds);
    return this.presigned.generateDownloadUrl(userId, key);
  }

  async searchAssets(userId: string, dto: SearchAssetsDto) {
    // Obtener IDs de orgs del usuario para filtrar en la búsqueda
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    return this.assetService.search(userId, orgIds, dto);
  }

  async updateAssetMetadata(userId: string, assetId: string, dto: UpdateAssetDto) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);
    return this.assetService.updateMetadata(assetId, userId, orgIds, dto);
  }

  async deleteAsset(userId: string, assetId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId },
      select: { organizationId: true },
    });
    const orgIds = memberships.map((m) => m.organizationId);

    // Soft delete en DB
    const deleted = await this.assetService.softDelete(assetId, userId, orgIds);

    // Hard delete inmediato en R2 (no esperar al cron)
    await this.object.deleteObject(deleted.key);

    return { id: deleted.id, key: deleted.key, deleted: true };
  }

  // ── Multipart upload ──────────────────────────────────────
  initiateMultipart(userId: string, dto: InitiateMultipartDto) {
    return this.multipart.initiate(userId, dto);
  }

  completeMultipart(userId: string, dto: CompleteMultipartDto) {
    return this.multipart.complete(userId, dto);
  }

  abortMultipart(userId: string, dto: AbortMultipartDto) {
    return this.multipart.abort(userId, dto);
  }
}
