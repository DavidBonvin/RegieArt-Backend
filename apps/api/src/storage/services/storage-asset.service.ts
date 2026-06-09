// ============================================================
// StorageAssetService — Capa de persistencia del módulo de storage.
//
// Responsabilidad única: operaciones CRUD sobre la tabla `assets` de Postgres.
// No sabe nada de R2, S3 ni URLs — eso es responsabilidad de los otros servicios.
//
// Convenciones:
//   - Soft delete: no borra filas, marca deletedAt y status=DELETED
//   - Los campos sanitizados llegan ya normalizados desde el caller
//   - BigInt se convierte a Number en la respuesta (JSON no soporta BigInt nativo)
// ============================================================

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { AssetStatus, AssetType as PrismaAssetType, Prisma } from '@regieart/database';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetType } from '../constants/upload-policies';
import { CreatePresignedUrlDto } from '../dto/create-presigned-url.dto';
import { UpdateAssetDto } from '../dto/update-asset.dto';
import { SearchAssetsDto } from '../dto/search-assets.dto';
import {
  sanitizeDescription,
  sanitizeDisplayName,
  sanitizeOriginalName,
  sanitizeTags,
} from '../utils/sanitize-key.util';

// Mapa de string → enum de Prisma (los valores son idénticos en mayúsculas)
const ASSET_TYPE_MAP: Record<AssetType, PrismaAssetType> = {
  [AssetType.USER_AVATAR]: PrismaAssetType.USER_AVATAR,
  [AssetType.ORG_BANNER]: PrismaAssetType.ORG_BANNER,
  [AssetType.AUDIO_TRACK]: PrismaAssetType.AUDIO_TRACK,
  [AssetType.MUSIC_SCORE]: PrismaAssetType.MUSIC_SCORE,
  [AssetType.FINANCIAL_RECEIPT]: PrismaAssetType.FINANCIAL_RECEIPT,
  [AssetType.TECHNICAL_FILE]: PrismaAssetType.TECHNICAL_FILE,
  [AssetType.REFERENCE_VIDEO]: PrismaAssetType.REFERENCE_VIDEO,
  [AssetType.LEGAL_DOCUMENT]: PrismaAssetType.LEGAL_DOCUMENT,
};

@Injectable()
export class StorageAssetService {
  private readonly logger = new Logger(StorageAssetService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Crear registro PENDING al iniciar el flujo de subida ───
  // Se llama desde StoragePresignedService justo después de firmar la URL.
  // Establece el "contrato" del archivo antes de que el cliente suba nada.
  async createPending(params: {
    key: string;
    assetType: AssetType;
    contentType: string;
    sizeBytes: number;
    uploadedById: string;
    orgId?: string;
    songId?: string;
    eventId?: string;
    dto: CreatePresignedUrlDto;
  }): Promise<{ id: string }> {
    // Upsert: si la key ya existe (ej. re-subida del mismo banner/track),
    // reseteamos el Asset a PENDING con los nuevos metadatos en vez de fallar.
    const assetData = {
      assetType: ASSET_TYPE_MAP[params.assetType],
      contentType: params.contentType,
      sizeBytes: BigInt(params.sizeBytes),
      status: AssetStatus.PENDING,
      uploadedById: params.uploadedById,
      orgId: params.orgId ?? null,
      songId: params.songId ?? null,
      eventId: params.eventId ?? null,
      etag: null as string | null,
      confirmedAt: null as Date | null,
      deletedAt: null as Date | null,
      // Metadatos sanitizados
      displayName: params.dto.displayName
        ? sanitizeDisplayName(params.dto.displayName)
        : null,
      originalName: params.dto.originalName
        ? sanitizeOriginalName(params.dto.originalName)
        : null,
      description: params.dto.description
        ? sanitizeDescription(params.dto.description)
        : null,
      tags: params.dto.tags ? sanitizeTags(params.dto.tags) : [],
      language: params.dto.language?.trim().slice(0, 10) ?? null,
      isPublic: params.dto.isPublic ?? false,
      // Metadatos técnicos opcionales (proporcionados por el cliente)
      durationSeconds: params.dto.durationSeconds ?? null,
      width: params.dto.width ?? null,
      height: params.dto.height ?? null,
      pageCount: params.dto.pageCount ?? null,
    };

    const data = await this.prisma.asset.upsert({
      where: { key: params.key },
      create: { key: params.key, ...assetData },
      update: { ...assetData },
      select: { id: true },
    });

    this.logger.debug(`Asset PENDING creado: id="${data.id}" key="${params.key}"`);
    return data;
  }

  // ── Confirmar upload: PENDING → CONFIRMED ─────────────────
  // Se llama desde StorageObjectService.confirmUpload() después del HeadObject OK.
  // Persiste metadatos técnicos verificados (etag, tamaño real de R2).
  async confirmByKey(params: {
    key: string;
    etag?: string;
    realSizeBytes?: number;      // Tamaño verificado por HeadObject (puede diferir del declarado)
    durationSeconds?: number;
    width?: number;
    height?: number;
    bitrate?: number;
    pageCount?: number;
  }): Promise<{ id: string; key: string }> {
    const asset = await this.prisma.asset.findUnique({
      where: { key: params.key },
      select: { id: true },
    });

    if (!asset) {
      // El asset puede no existir si la subida fue iniciada por un flujo antiguo.
      // En ese caso simplemente continuamos sin actualizar la DB.
      this.logger.warn(`confirm-upload: no se encontró Asset para key="${params.key}"`);
      return { id: 'unknown', key: params.key };
    }

    const updated = await this.prisma.asset.update({
      where: { key: params.key },
      data: {
        status: AssetStatus.CONFIRMED,
        confirmedAt: new Date(),
        etag: params.etag,
        ...(params.realSizeBytes && { sizeBytes: BigInt(params.realSizeBytes) }),
        ...(params.durationSeconds !== undefined && { durationSeconds: params.durationSeconds }),
        ...(params.width !== undefined && { width: params.width }),
        ...(params.height !== undefined && { height: params.height }),
        ...(params.bitrate !== undefined && { bitrate: params.bitrate }),
        ...(params.pageCount !== undefined && { pageCount: params.pageCount }),
      },
      select: { id: true, key: true },
    });

    this.logger.log(`Asset CONFIRMED: id="${updated.id}" key="${params.key}"`);
    return updated;
  }

  // ── Verificar acceso de descarga por ID ───────────────────
  // Úsalo cuando el cliente solicita descarga por assetId (en vez de key).
  // Lanza NotFoundException o ForbiddenException según corresponda.
  // Assets públicos son accesibles por cualquier usuario autenticado.
  async assertCanDownload(
    id: string,
    userId: string,
    orgIds: string[],
  ): Promise<{ key: string }> {
    const asset = await this.prisma.asset.findUnique({
      where: { id, deletedAt: null },
      select: { id: true, key: true, uploadedById: true, orgId: true, isPublic: true },
    });

    if (!asset) throw new NotFoundException(`Asset "${id}" no encontrado.`);

    // Assets públicos: cualquier usuario autenticado puede descargarlos
    if (asset.isPublic) return { key: asset.key };

    const canAccess =
      asset.uploadedById === userId ||
      (asset.orgId !== null && orgIds.includes(asset.orgId));

    if (!canAccess) {
      throw new ForbiddenException('No tienes permiso para descargar este archivo.');
    }

    return { key: asset.key };
  }

  // ── Obtener un asset por ID ────────────────────────────────
  async findById(id: string): Promise<AssetResponse | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { id, deletedAt: null },
    });
    return asset ? this.serialize(asset) : null;
  }

  // ── Obtener un asset por key ──────────────────────────────
  async findByKey(key: string): Promise<AssetResponse | null> {
    const asset = await this.prisma.asset.findUnique({
      where: { key, deletedAt: null },
    });
    return asset ? this.serialize(asset) : null;
  }

  // ── Buscar assets con filtros ─────────────────────────────
  async search(
    userId: string,
    orgIds: string[],        // IDs de orgs de las que el usuario es miembro
    dto: SearchAssetsDto,
  ): Promise<{ items: AssetResponse[]; total: number; page: number; pages: number }> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AssetWhereInput = {
      deletedAt: null,
      status: { not: AssetStatus.DELETED },
      // Solo assets del usuario o de sus orgs (seguridad)
      OR: [
        { uploadedById: userId },
        { orgId: { in: orgIds } },
      ],
    };

    if (dto.assetType?.length) {
      where.assetType = { in: dto.assetType.map((t) => ASSET_TYPE_MAP[t]) };
    }
    if (dto.orgId) where.orgId = dto.orgId;
    if (dto.songId) where.songId = dto.songId;
    if (dto.eventId) where.eventId = dto.eventId;
    if (dto.language) where.language = dto.language;
    if (dto.tags?.length) where.tags = { hasEvery: sanitizeTags(dto.tags) };
    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {};
      if (dto.createdFrom) where.createdAt.gte = new Date(dto.createdFrom);
      if (dto.createdTo) where.createdAt.lte = new Date(dto.createdTo);
    }
    if (dto.q) {
      const q = dto.q.trim();
      // Add full-text filter as AND (preserves the security OR filter above)
      where.AND = [
        {
          OR: [
            { displayName: { contains: q, mode: 'insensitive' } },
            { originalName: { contains: q, mode: 'insensitive' } },
            { description: { contains: q, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const orderBy: Prisma.AssetOrderByWithRelationInput = {
      [dto.orderBy ?? 'createdAt']: dto.order ?? 'desc',
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.asset.findMany({ where, orderBy, skip, take: limit }),
      this.prisma.asset.count({ where }),
    ]);

    return {
      items: items.map((a) => this.serialize(a)),
      total,
      page,
      pages: Math.ceil(total / limit),
    };
  }

  // ── Actualizar metadatos ──────────────────────────────────
  async updateMetadata(
    id: string,
    userId: string,
    orgIds: string[],
    dto: UpdateAssetDto,
  ): Promise<AssetResponse> {
    const asset = await this.prisma.asset.findUnique({ where: { id, deletedAt: null } });
    if (!asset) throw new NotFoundException(`Asset "${id}" no encontrado.`);

    // Solo el uploader o un miembro de la org propietaria puede editar
    const canEdit =
      asset.uploadedById === userId ||
      (asset.orgId !== null && orgIds.includes(asset.orgId));
    if (!canEdit) throw new UnauthorizedException('No tienes permiso para editar este archivo.');

    const updated = await this.prisma.asset.update({
      where: { id },
      data: {
        ...(dto.displayName !== undefined && {
          displayName: sanitizeDisplayName(dto.displayName),
        }),
        ...(dto.description !== undefined && {
          description: sanitizeDescription(dto.description),
        }),
        ...(dto.tags !== undefined && { tags: sanitizeTags(dto.tags) }),
        ...(dto.language !== undefined && { language: dto.language.trim().slice(0, 10) }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
      },
    });

    return this.serialize(updated);
  }

  // ── Soft delete ───────────────────────────────────────────
  // Marca el asset como DELETED en la DB.
  // El GC real del objeto en R2 lo hace el StorageCleanupService.
  async softDelete(
    id: string,
    userId: string,
    orgIds: string[],
  ): Promise<{ id: string; key: string }> {
    const asset = await this.prisma.asset.findUnique({ where: { id, deletedAt: null } });
    if (!asset) throw new NotFoundException(`Asset "${id}" no encontrado.`);

    const canDelete =
      asset.uploadedById === userId ||
      (asset.orgId !== null && orgIds.includes(asset.orgId));
    if (!canDelete) throw new UnauthorizedException('No tienes permiso para eliminar este archivo.');

    const deleted = await this.prisma.asset.update({
      where: { id },
      data: { status: AssetStatus.DELETED, deletedAt: new Date() },
      select: { id: true, key: true },
    });

    this.logger.log(`Asset soft-deleted: id="${deleted.id}" key="${deleted.key}"`);
    return deleted;
  }

  // ── Listar assets PENDING expirados (para el cron de limpieza) ──
  async findExpiredPending(olderThanHours: number): Promise<{ id: string; key: string }[]> {
    const cutoff = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);
    return this.prisma.asset.findMany({
      where: { status: AssetStatus.PENDING, createdAt: { lt: cutoff } },
      select: { id: true, key: true },
    });
  }

  // ── Listar assets DELETED pendientes de purga real en R2 ──
  async findDeletedForPurge(): Promise<{ id: string; key: string }[]> {
    return this.prisma.asset.findMany({
      where: { status: AssetStatus.DELETED, deletedAt: { not: null } },
      select: { id: true, key: true },
      take: 100, // procesar en lotes
    });
  }

  // ── Hard delete (usado por el cron de limpieza después de borrar en R2) ──
  async hardDelete(ids: string[]): Promise<void> {
    await this.prisma.asset.deleteMany({ where: { id: { in: ids } } });
  }

  // ── Serialización: BigInt → number para JSON ──────────────
  // JSON.stringify lanza error con BigInt nativo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private serialize(asset: any): AssetResponse {
    return {
      ...asset,
      sizeBytes: Number(asset.sizeBytes),
    };
  }
}

// ── Tipo de respuesta pública (BigInt ya convertido a number) ──
export interface AssetResponse {
  id: string;
  key: string;
  assetType: PrismaAssetType;
  contentType: string;
  sizeBytes: number;
  status: AssetStatus;
  etag: string | null;
  displayName: string | null;
  originalName: string | null;
  description: string | null;
  tags: string[];
  language: string | null;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  pageCount: number | null;
  bitrate: number | null;
  isMultipart: boolean;
  isPublic: boolean;
  uploadedById: string;
  orgId: string | null;
  songId: string | null;
  eventId: string | null;
  memberId: string | null;
  version: number;
  replacesId: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  confirmedAt: Date | null;
  deletedAt: Date | null;
  updatedAt: Date;
}
