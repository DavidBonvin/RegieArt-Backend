// ============================================================
// StorageObjectService — Gestión de objetos ya existentes en R2.
//
// Responsabilidades:
//   - confirmUpload: verifica ownership + existencia real → actualiza Asset en DB
//   - deleteObject:  elimina de R2 + invalida caché de descarga
//   - listObjects:   lista objetos R2 con verificación de permisos
// ============================================================

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { S3_BUCKET, S3_CLIENT } from '../providers/s3-client.provider';
import { AssetType } from '../constants/upload-policies';
import { ConfirmUploadDto } from '../dto/confirm-upload.dto';
import { StorageMembershipService } from './storage-membership.service';
import { StorageAssetService, AssetResponse } from './storage-asset.service';
import { StoragePresignedService } from './storage-presigned.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StorageObjectService {
  private readonly logger = new Logger(StorageObjectService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(S3_BUCKET) private readonly bucket: string,
    private readonly membership: StorageMembershipService,
    private readonly assetService: StorageAssetService,
    private readonly presigned: StoragePresignedService,
    private readonly prisma: PrismaService,
  ) {}

  // ── Confirmación post-upload ────────────────────────────────
  // El cliente llama DESPUÉS de completar el PUT a R2.
  // 1. Ownership check (ruta profiles/ u organizations/)
  // 2. HeadObject → verifica que el archivo existe en R2
  // 3. Actualiza Asset en DB: PENDING → CONFIRMED + metadatos técnicos del HeadObject
  async confirmUpload(
    userId: string,
    dto: ConfirmUploadDto,
  ): Promise<{ asset: AssetResponse; key: string; assetType: AssetType }> {
    // Ownership check
    if (dto.key.startsWith('profiles/')) {
      if (!dto.key.startsWith(`profiles/${userId}/`)) {
        throw new UnauthorizedException(
          'La clave del archivo no corresponde a tu cuenta.',
        );
      }
    } else if (dto.key.startsWith('organizations/')) {
      const orgId = dto.key.split('/')[1];
      await this.membership.assertMembership(userId, orgId);
    } else {
      throw new UnauthorizedException(
        'La clave del archivo tiene un formato de ruta desconocido.',
      );
    }

    // Verificar existencia real en R2 — HeadObject no descarga el binario
    let headResult: { etag?: string; size?: number } = {};
    try {
      const head = await this.s3.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: dto.key }),
      );
      headResult = {
        etag: head.ETag?.replace(/"/g, ''),   // R2 devuelve el ETag con comillas
        size: head.ContentLength,
      };
    } catch {
      throw new BadRequestException(
        'El archivo no fue encontrado en el storage. Completa la subida antes de confirmar.',
      );
    }

    // Actualizar el registro Asset en DB con los datos verificados de R2
    const confirmed = await this.assetService.confirmByKey({
      key: dto.key,
      etag: headResult.etag,
      realSizeBytes: headResult.size,
      durationSeconds: dto.durationSeconds,
      width: dto.width,
      height: dto.height,
      bitrate: dto.bitrate,
      pageCount: dto.pageCount,
    });

    this.logger.log(
      `Upload confirmado: user="${userId}" key="${dto.key}" assetId="${confirmed.id}"`,
    );

    // If the uploaded asset is a profile image, update the canonical URL on the user record.
    // This ensures GET /users/me always returns up-to-date avatar/banner without extra queries.
    if (dto.assetType === AssetType.USER_AVATAR || dto.assetType === AssetType.USER_BANNER) {
      const cdnKey = dto.assetType === AssetType.USER_AVATAR ? 'avatarUrl' : 'bannerUrl';
      // Build the public key path — R2 key without signed parameters
      const publicPath = `${process.env['STORAGE_CDN_URL'] ?? `https://${process.env['STORAGE_BUCKET_NAME']}.r2.cloudflarestorage.com`}/${dto.key}`;
      await this.prisma.user.update({
        where: { id: userId },
        data: { [cdnKey]: publicPath },
      }).catch(() => {}); // Non-critical — profile still works via storage endpoint
    }

    // Obtener el asset completo para la respuesta
    const asset = await this.assetService.findByKey(dto.key);

    return {
      asset: asset ?? ({ key: dto.key } as AssetResponse),
      key: dto.key,
      assetType: dto.assetType,
    };
  }

  // ── Eliminación de objetos ──────────────────────────────────
  // Borra el objeto de R2 e invalida el caché de descarga Redis.
  // Los errores se absorben: si el archivo ya no existía, es igualmente OK.
  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      this.logger.debug(`Objeto eliminado de R2: key="${key}"`);
    } catch (error) {
      this.logger.error(
        `Fallo al eliminar key="${key}"`,
        error instanceof Error ? error.stack : error,
      );
    }
    // Invalida la URL firmada cacheada en Redis para evitar que el cliente
    // intente usar una URL que ya no apunta a ningún objeto válido
    await this.presigned.invalidateDownloadCache(key);
  }

  // ── Listar objetos ──────────────────────────────────────────
  async listObjects(
    userId: string,
    prefix: string,
  ): Promise<{ key: string; size: number; lastModified: Date }[]> {
    if (prefix.startsWith('profiles/')) {
      if (!prefix.startsWith(`profiles/${userId}/`)) {
        throw new UnauthorizedException(
          'El prefijo de búsqueda no corresponde a tu cuenta.',
        );
      }
    } else if (prefix.startsWith('organizations/')) {
      const orgId = prefix.split('/')[1];
      await this.membership.assertMembership(userId, orgId);
    } else {
      throw new UnauthorizedException(
        'El prefijo de búsqueda tiene un formato de ruta desconocido.',
      );
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: 200,
    });

    const response = await this.s3.send(command);

    return (response.Contents ?? []).map((item) => ({
      key: item.Key ?? '',
      size: item.Size ?? 0,
      lastModified: item.LastModified ?? new Date(0),
    }));
  }
}
