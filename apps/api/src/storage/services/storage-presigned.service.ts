// ============================================================
// StoragePresignedService — Firma de URLs temporales de subida y descarga.
//
// Contiene la lógica central del patrón Pre-signed URL:
//   - Subida (PUT):    valida política → verifica membresía → crea Asset PENDING → firma URL
//   - Descarga (GET):  verifica caché Redis → firma URL → guarda en caché 4 min
//
// El servidor NUNCA recibe binarios. Solo firma autorizaciones temporales
// para que el cliente (React/RN) opere directamente contra Cloudflare R2.
// ============================================================

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { S3_BUCKET, S3_CDN_URL, S3_CLIENT } from '../providers/s3-client.provider';
import { AssetType, PathParams, UPLOAD_POLICIES } from '../constants/upload-policies';
import { CreatePresignedUrlDto } from '../dto/create-presigned-url.dto';
import { StorageMembershipService } from './storage-membership.service';
import { StorageAssetService } from './storage-asset.service';
import { RedisService } from '../../redis/redis.service';

// ─── Tipos exportados ─────────────────────────────────────────
export interface PresignedUploadResponse {
  uploadUrl: string;
  key: string;
  assetId: string;        // ID del registro Asset creado en DB (PENDING)
  expiresIn: number;
  assetType: AssetType;
  fileId?: string;        // Solo cuando el backend genera el fileId
}

const UPLOAD_EXPIRY_SECONDS = 900;    // 15 minutos para completar la subida
const DOWNLOAD_EXPIRY_SECONDS = 300;  // 5 minutos para acceder al archivo
const DOWNLOAD_CACHE_TTL = 240;       // 4 minutos en caché Redis (expira antes que la URL)

// Tipos de activo que contienen datos personales sensibles (contratos, documentos legales,
// recibos financieros). Sus URLs de descarga usan una expiración corta de 1 minuto
// y nunca se cachean en Redis — cada petición genera una firma criptográfica nueva.
// Usar string literals de Prisma para no acoplar este servicio al enum de Prisma.
const SENSITIVE_ASSET_TYPES = new Set(['LEGAL_DOCUMENT', 'FINANCIAL_RECEIPT']);
const SENSITIVE_DOWNLOAD_EXPIRY_SECONDS = 60; // 1 minuto

// Prefijo de caché Redis para URLs de descarga
const DOWNLOAD_URL_CACHE_PREFIX = 'storage:download-url:';

function assertRequiredParams(
  assetType: AssetType,
  params: PathParams,
  required: Array<keyof PathParams>,
): void {
  const missing = required.filter((field) => !params[field]);
  if (missing.length > 0) {
    throw new BadRequestException(
      `Faltan parámetros requeridos para el tipo '${assetType}': ${missing.join(', ')}.`,
    );
  }
}

@Injectable()
export class StoragePresignedService {
  private readonly logger = new Logger(StoragePresignedService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_BUCKET) private readonly bucket: string,
    @Inject(S3_CDN_URL) private readonly cdnBaseUrl: string | undefined,
    private readonly membership: StorageMembershipService,
    private readonly assetService: StorageAssetService,
    private readonly redis: RedisService,
  ) {}

  // ── Genera URL pre-firmada de subida (PUT) ──────────────────
  async generateUploadUrl(
    userId: string,
    dto: CreatePresignedUrlDto,
  ): Promise<PresignedUploadResponse> {
    const policy = UPLOAD_POLICIES[dto.assetType];

    if (!policy.allowedMimeTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Content-Type '${dto.contentType}' no es válido para '${dto.assetType}'. ` +
          `Formatos aceptados: ${policy.allowedMimeTypes.join(', ')}.`,
      );
    }

    if (dto.fileSizeBytes > policy.maxSizeBytes) {
      const limitMb = (policy.maxSizeBytes / (1024 * 1024)).toFixed(0);
      const requestedMb = (dto.fileSizeBytes / (1024 * 1024)).toFixed(2);
      throw new BadRequestException(
        `El archivo (${requestedMb} MB) supera el límite permitido de ${limitMb} MB ` +
          `para el tipo '${dto.assetType}'.`,
      );
    }

    const pathParams: PathParams = {
      userId,
      orgId: dto.orgId,
      songId: dto.songId,
      eventId: dto.eventId,
      fileId: dto.fileId,
    };

    let serverGeneratedFileId: string | undefined;
    if (policy.serverGeneratesFileId) {
      serverGeneratedFileId = crypto.randomUUID();
      pathParams.fileId = serverGeneratedFileId;
    }

    assertRequiredParams(dto.assetType, pathParams, policy.requiredParams);

    if (dto.orgId) {
      await this.membership.assertMembership(userId, dto.orgId);
    }

    const key = policy.buildKey(pathParams);

    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: dto.contentType,
        ContentLength: dto.fileSizeBytes,
        Metadata: {
          'uploaded-by-user-id': userId,
          'asset-type': dto.assetType,
        },
      });

      const uploadUrl = await getSignedUrl(this.s3, command, {
        expiresIn: UPLOAD_EXPIRY_SECONDS,
      });

      // Crear el registro PENDING en la DB — el confirm-upload lo actualizará a CONFIRMED.
      // Si esto falla, la URL ya fue firmada y el cliente puede subir de todas formas;
      // el confirm-upload creará el registro si no existe (graceful degradation).
      let assetId = 'pending-db-error';
      try {
        const created = await this.assetService.createPending({
          key,
          assetType: dto.assetType,
          contentType: dto.contentType,
          sizeBytes: dto.fileSizeBytes,
          uploadedById: userId,
          orgId: dto.orgId,
          songId: dto.songId,
          eventId: dto.eventId,
          dto,
        });
        assetId = created.id;
      } catch (dbError) {
        // Si la key ya existe (subida repetida), actualizamos status a PENDING de nuevo
        this.logger.warn(`Asset ya existe para key="${key}", ignorando error de creación.`);
      }

      this.logger.debug(
        `URL de subida generada: user="${userId}" key="${key}" assetId="${assetId}"`,
      );

      return {
        uploadUrl,
        key,
        assetId,
        expiresIn: UPLOAD_EXPIRY_SECONDS,
        assetType: dto.assetType,
        ...(serverGeneratedFileId && { fileId: serverGeneratedFileId }),
      };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(
        `Fallo al firmar URL de subida para key="${key}"`,
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        'No se pudo generar la URL de subida segura. Inténtalo de nuevo.',
      );
    }
  }

  // ── Genera URL pre-firmada de descarga (GET) ────────────────
  // Cache-Aside en Redis: evita re-firmar la URL en cada petición del mismo recurso.
  // El cliente puede pedir la URL del mismo archivo docenas de veces (renders, recargas)
  // y solo se genera una firma criptográfica por ventana de 4 minutos.
  //
  // Ownership check:
  //   - profiles/<userId>/*  → el caller debe ser el propietario del perfil
  //   - organizations/<id>/* → el caller debe ser miembro activo de esa org
  //
  // Fast path CDN:
  //   - Si el asset tiene isPublic=true y CDN está configurado, devuelve URL pública
  //     directamente sin tocar R2 ni Redis (ahorra latencia + coste de firma).
  // assetType: el tipo Prisma del asset (ej. 'LEGAL_DOCUMENT'). Si se pasa y corresponde
  // a un tipo sensible, se usa expiración corta (1 min) y se omite la caché Redis.
  async generateDownloadUrl(userId: string, key: string, assetType?: string): Promise<string> {
    // ── 1. Ownership check ──────────────────────────────────────
    await this.assertKeyAccess(userId, key);

    // ── 2. CDN fast path for public assets ─────────────────────
    // If CDN is configured and the asset is public, no signing needed —
    // the CDN public URL is sufficient and never expires.
    const cdnUrl = await this.tryGetPublicCdnUrl(key);
    if (cdnUrl) return cdnUrl;

    // Sensitive documents: short-lived URL (1 min) without Redis cache.
    // Each download requires a backend request → traceability + minimal exposure.
    const isSensitive = assetType !== undefined && SENSITIVE_ASSET_TYPES.has(assetType);
    const expirySeconds = isSensitive ? SENSITIVE_DOWNLOAD_EXPIRY_SECONDS : DOWNLOAD_EXPIRY_SECONDS;

    const cacheKey = `${DOWNLOAD_URL_CACHE_PREFIX}${key}`;

    // ── 3. Check Redis cache (skip for sensitive types) ──────────
    if (!isSensitive) {
      try {
        const redis = this.redis.getClient();
        const cached = await redis.get(cacheKey);
        if (cached) {
          this.logger.debug(`Download URL cache HIT: key="${key}"`);
          return cached;
        }
      } catch (cacheError) {
        // If Redis is unavailable, continue without cache — never block downloads
        this.logger.warn(`Redis unavailable for download URL cache: ${String(cacheError)}`);
      }
    }

    // ── 4. Sign URL with R2 ────────────────────────────────────
    try {
      const url = await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expirySeconds },
      );

      // Cache only for non-sensitive types
      if (!isSensitive) {
        try {
          const redis = this.redis.getClient();
          await redis.setex(cacheKey, DOWNLOAD_CACHE_TTL, url);
        } catch {
          this.logger.debug(`Redis cache write skipped for download URL: key="${key}"`);
          // Cache write error — non-critical
        }
      }

      this.logger.debug(
        `Download URL generated: key="${key}" expiry=${expirySeconds}s sensitive=${isSensitive}`,
      );
      return url;
    } catch (error) {
      this.logger.error(
        `Failed to sign download URL for key="${key}"`,
        error instanceof Error ? error.stack : error,
      );
      throw new InternalServerErrorException(
        'Failed to generate the download URL. Please try again.',
      );
    }
  }

  // ── Validates that the requesting user has access to the given key ──
  // profiles/<userId>/*  → caller must be the profile owner
  // organizations/<id>/* → caller must be an active org member
  private async assertKeyAccess(userId: string, key: string): Promise<void> {
    if (key.startsWith('profiles/')) {
      const ownerSegment = key.split('/')[1];
      if (ownerSegment !== userId) {
        throw new ForbiddenException('You do not have permission to access this file.');
      }
    } else if (key.startsWith('organizations/')) {
      const orgId = key.split('/')[1];
      await this.membership.assertMembership(userId, orgId);
    } else {
      throw new ForbiddenException('The file key has an unknown path format.');
    }
  }

  // ── Returns the public CDN URL if the asset is public, null otherwise ──
  private async tryGetPublicCdnUrl(key: string): Promise<string | null> {
    if (!this.cdnBaseUrl) return null;
    const asset = await this.assetService.findByKey(key);
    if (asset?.isPublic) {
      const cdnUrl = `${this.cdnBaseUrl.replace(/\/$/, '')}/${key}`;
      this.logger.debug(`Download URL fast-path CDN (public): key="${key}"`);
      return cdnUrl;
    }
    return null;
  }

  // ── Invalidates the download URL cache ────────────────────────
  // Call when a file is deleted or replaced to prevent
  // serving valid URLs pointing to already-deleted objects.
  async invalidateDownloadCache(key: string): Promise<void> {
    try {
      const redis = this.redis.getClient();
      await redis.del(`${DOWNLOAD_URL_CACHE_PREFIX}${key}`);
    } catch {
      this.logger.debug(`Redis invalidation skipped for key="${key}"`);
      // Non-critical
    }
  }
}
