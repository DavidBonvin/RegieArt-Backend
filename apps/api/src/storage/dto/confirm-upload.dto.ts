// ============================================================
// DTO de confirmación post-upload.
//
// El cliente llama a POST /storage/confirm-upload después de
// completar el PUT directo a Cloudflare R2.
//
// El backend verifica que la key pertenece al usuario autenticado
// y actualiza el registro Asset en la DB de PENDING → CONFIRMED.
//
// Los metadatos adicionales (durationSeconds, width, height, etc.)
// son opcionales — el cliente los proporciona si ya los conoce
// (ej. un reproductor de audio que sabe la duración antes de subir).
// ============================================================

import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AssetType } from '../constants/upload-policies';

export class ConfirmUploadDto {
  // La clave S3 devuelta por el endpoint presigned-upload
  @IsString()
  @IsNotEmpty()
  key!: string;

  // El tipo de activo — permite al backend saber qué acción tomar
  @IsEnum(AssetType)
  assetType!: AssetType;

  // ── Metadatos técnicos opcionales ─────────────────────────
  // El cliente los proporciona cuando los conoce (después de renderizar el archivo).

  // Duración en segundos (audio / video)
  @IsInt()
  @Min(0)
  @IsOptional()
  durationSeconds?: number;

  // Ancho en píxeles (imágenes / video)
  @IsInt()
  @Min(1)
  @IsOptional()
  width?: number;

  // Alto en píxeles (imágenes / video)
  @IsInt()
  @Min(1)
  @IsOptional()
  height?: number;

  // Bitrate en kbps (audio / video)
  @IsInt()
  @Min(1)
  @IsOptional()
  bitrate?: number;

  // Número de páginas (PDFs)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  pageCount?: number;
}
