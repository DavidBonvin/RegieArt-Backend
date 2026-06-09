// ============================================================
// StorageMultipartService — Subida de archivos grandes en partes.
//
// Implementa el protocolo S3 Multipart Upload, compatible con Cloudflare R2.
//
// ¿Cuándo usar multipart vs. presigned PUT simple?
//   < 50 MB  → presigned PUT (un solo request, simple)
//   > 50 MB  → multipart (partes en paralelo, reanudable)
//
// Ventajas del multipart:
//   - Paralelización: el cliente sube 3-5 partes simultáneas → 3-5x más rápido
//   - Reanudabilidad: si falla una parte, solo se re-sube esa parte
//   - No hay límite práctico de tamaño (R2 soporta hasta 5 TB)
//
// Flujo completo:
//   1. POST /storage/multipart/initiate  → { uploadId, key, parts[], assetId }
//   2. Cliente hace PUT a cada part.uploadUrl con la parte del binario
//   3. POST /storage/multipart/complete  → R2 ensambla el objeto final
//   4. (Si falla) DELETE /storage/multipart/abort → libera partes incompletas
// ============================================================

import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { S3_BUCKET, S3_CLIENT } from '../providers/s3-client.provider';
import { AssetType, UPLOAD_POLICIES } from '../constants/upload-policies';
import { InitiateMultipartDto, CompleteMultipartDto, AbortMultipartDto } from '../dto/multipart.dto';
import { StorageMembershipService } from './storage-membership.service';
import { StorageAssetService } from './storage-asset.service';

// Tamaño mínimo de parte según la spec de S3 (5 MB), excepto la última parte
const MIN_PART_SIZE = 5 * 1024 * 1024;
// Tamaño de parte por defecto (10 MB — buen balance velocidad/overhead)
const DEFAULT_PART_SIZE = 10 * 1024 * 1024;
// Máximo de partes que R2/S3 soporta
const MAX_PARTS = 10_000;
// Tiempo de vida de cada URL de parte (15 minutos)
const PART_URL_EXPIRY = 900;

export interface MultipartInitiateResponse {
  uploadId: string;
  key: string;
  assetId: string;
  parts: Array<{ partNumber: number; uploadUrl: string; sizeBytes: number }>;
  totalParts: number;
  partSizeBytes: number;
}

@Injectable()
export class StorageMultipartService {
  private readonly logger = new Logger(StorageMultipartService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_BUCKET) private readonly bucket: string,
    private readonly membership: StorageMembershipService,
    private readonly assetService: StorageAssetService,
  ) {}

  // ── Iniciar multipart upload ────────────────────────────────
  async initiate(
    userId: string,
    dto: InitiateMultipartDto,
  ): Promise<MultipartInitiateResponse> {
    const policy = UPLOAD_POLICIES[dto.assetType];

    if (!policy.allowedMimeTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Content-Type '${dto.contentType}' no permitido para '${dto.assetType}'.`,
      );
    }

    if (dto.fileSizeBytes > policy.maxSizeBytes) {
      const limitMb = (policy.maxSizeBytes / (1024 * 1024)).toFixed(0);
      throw new BadRequestException(
        `El archivo supera el límite de ${limitMb} MB para '${dto.assetType}'.`,
      );
    }

    if (dto.orgId) {
      await this.membership.assertMembership(userId, dto.orgId);
    }

    // Construir la key (reutilizamos la lógica de políticas)
    const fileId = crypto.randomUUID();
    const key = policy.buildKey({
      userId,
      orgId: dto.orgId,
      songId: dto.songId,
      eventId: dto.eventId,
      fileId,
    });

    // Calcular el tamaño de cada parte
    const rawPartSize = dto.partSizeBytes ?? DEFAULT_PART_SIZE;
    const partSize = Math.max(rawPartSize, MIN_PART_SIZE);
    const totalParts = Math.ceil(dto.fileSizeBytes / partSize);

    if (totalParts > MAX_PARTS) {
      throw new BadRequestException(
        `El archivo requiere ${totalParts} partes, excede el máximo de ${MAX_PARTS}.`,
      );
    }

    // Crear el multipart upload en R2
    const createCmd = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.contentType,
      Metadata: {
        'uploaded-by-user-id': userId,
        'asset-type': dto.assetType,
        'total-parts': String(totalParts),
      },
    });

    let uploadId: string;
    try {
      const result = await this.s3.send(createCmd);
      uploadId = result.UploadId!;
    } catch (error) {
      this.logger.error('Fallo al crear multipart upload', error);
      throw new InternalServerErrorException('No se pudo iniciar la subida.');
    }

    // Generar URLs pre-firmadas para cada parte en paralelo
    const partPromises = Array.from({ length: totalParts }, async (_, i) => {
      const partNumber = i + 1;
      const start = i * partSize;
      const end = Math.min(start + partSize, dto.fileSizeBytes);
      const sizeBytes = end - start;

      const uploadUrl = await getSignedUrl(
        this.s3,
        new UploadPartCommand({
          Bucket: this.bucket,
          Key: key,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: PART_URL_EXPIRY },
      );

      return { partNumber, uploadUrl, sizeBytes };
    });

    const parts = await Promise.all(partPromises);

    // Crear Asset PENDING en DB con referencia al uploadId
    let assetId = 'pending';
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
        dto: {
          ...dto,
          fileSizeBytes: dto.fileSizeBytes,
        } as any,
      });
      assetId = created.id;

      // Marcar el asset como multipart en la DB
      await this.assetService['prisma'].asset.update({
        where: { id: assetId },
        data: { isMultipart: true, uploadId, partCount: totalParts },
      });
    } catch (e) {
      this.logger.warn(`No se pudo crear Asset PENDING para multipart key="${key}"`);
    }

    this.logger.log(
      `Multipart iniciado: key="${key}" uploadId="${uploadId}" partes=${totalParts}`,
    );

    return { uploadId, key, assetId, parts, totalParts, partSizeBytes: partSize };
  }

  // ── Completar multipart upload ──────────────────────────────
  // R2 ensambla todas las partes en un objeto final atómico.
  async complete(
    userId: string,
    dto: CompleteMultipartDto,
  ): Promise<{ key: string; etag: string }> {
    // Verificar ownership antes de completar
    if (dto.key.startsWith('organizations/')) {
      const orgId = dto.key.split('/')[1];
      await this.membership.assertMembership(userId, orgId);
    }

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: dto.key,
      UploadId: dto.uploadId,
      MultipartUpload: {
        Parts: dto.parts.map((p) => ({
          PartNumber: p.partNumber,
          ETag: p.etag,
        })),
      },
    });

    try {
      const result = await this.s3.send(command);
      const etag = result.ETag?.replace(/"/g, '') ?? '';

      this.logger.log(`Multipart completado: key="${dto.key}" etag="${etag}"`);
      return { key: dto.key, etag };
    } catch (error) {
      this.logger.error(`Fallo al completar multipart key="${dto.key}"`, error);
      throw new InternalServerErrorException(
        'No se pudo completar la subida. Las partes pueden haber expirado.',
      );
    }
  }

  // ── Abortar multipart upload ────────────────────────────────
  // Libera los fragmentos de R2 y evita cargos por almacenamiento de partes incompletas.
  // También elimina el registro Asset PENDING de la DB inmediatamente
  // (sin esperar al cron de limpieza de 24h).
  async abort(userId: string, dto: AbortMultipartDto): Promise<void> {
    if (dto.key.startsWith('organizations/')) {
      const orgId = dto.key.split('/')[1];
      await this.membership.assertMembership(userId, orgId);
    }

    // Abortar en R2 (libera partes parciales — evita cargos de almacenamiento)
    try {
      await this.s3.send(
        new AbortMultipartUploadCommand({
          Bucket: this.bucket,
          Key: dto.key,
          UploadId: dto.uploadId,
        }),
      );
      this.logger.log(`Multipart abortado en R2: key="${dto.key}"`);
    } catch (error) {
      // Si R2 falla (ej. ya expiró), no bloqueamos — el asset sí lo limpiamos
      this.logger.warn(`No se pudo abortar multipart en R2 key="${dto.key}"`, error);
    }

    // Limpiar el registro PENDING en DB inmediatamente (sin esperar al cron de 24h)
    const asset = await this.assetService.findByKey(dto.key);
    if (asset) {
      await this.assetService.hardDelete([asset.id]);
      this.logger.log(`Asset PENDING eliminado tras abort: id="${asset.id}" key="${dto.key}"`);
    }
  }
}
