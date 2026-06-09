// ============================================================
// DTOs para Multipart Upload (archivos > 50 MB).
//
// Flujo:
//   1. POST /storage/multipart/initiate → { uploadId, key, parts[] }
//   2. Cliente sube cada parte con PUT a cada URL individual
//   3. POST /storage/multipart/complete → { key, finalSize }
//   4. (Si falla) DELETE /storage/multipart/abort → cancela y libera R2
// ============================================================

import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AssetType } from '../constants/upload-policies';

// ── Iniciar multipart upload ──────────────────────────────────
export class InitiateMultipartDto {
  @IsEnum(AssetType, {
    message: `assetType debe ser uno de: ${Object.values(AssetType).join(', ')}`,
  })
  assetType!: AssetType;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  // Tamaño total del archivo en bytes (para calcular el número de partes)
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  // Tamaño de cada parte en bytes — mínimo 5 MB (límite S3/R2)
  // El backend lo ajusta automáticamente si es menor al mínimo.
  @IsInt()
  @Min(5_242_880) // 5 MB mínimo por spec de S3
  @IsOptional()
  partSizeBytes?: number;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  orgId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  songId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  eventId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(256)
  displayName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(512)
  originalName?: string;
}

// ── Parte completada ──────────────────────────────────────────
export class CompletedPartDto {
  // Número de parte (1-indexed)
  @IsInt()
  @Min(1)
  partNumber!: number;

  // ETag devuelto por R2 al completar el PUT de la parte
  @IsString()
  @IsNotEmpty()
  etag!: string;
}

// ── Completar multipart upload ────────────────────────────────
export class CompleteMultipartDto {
  // Key del objeto en R2 (devuelta por el initiate)
  @IsString()
  @IsNotEmpty()
  key!: string;

  // ID del upload multipart (devuelto por el initiate)
  @IsString()
  @IsNotEmpty()
  uploadId!: string;

  // Lista de partes completadas con sus ETags
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompletedPartDto)
  parts!: CompletedPartDto[];
}

// ── Abortar multipart upload ──────────────────────────────────
export class AbortMultipartDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  uploadId!: string;
}
