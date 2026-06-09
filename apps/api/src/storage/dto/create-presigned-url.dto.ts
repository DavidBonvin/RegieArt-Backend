// ============================================================
// DTO de solicitud de URL pre-firmada de subida.
//
// class-validator se encarga de la validación automática gracias
// al ValidationPipe global configurado en main.ts con
// { whitelist: true, forbidNonWhitelisted: true, transform: true }.
//
// El cliente DEBE declarar el contentType y fileSizeBytes
// antes de subir, para que el backend pueda validar y firmar
// la URL con las restricciones correctas en Cloudflare R2.
//
// Los campos de metadatos (displayName, tags, etc.) son opcionales
// y se persisten en la tabla Asset durante el presigned-upload.
// ============================================================

import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AssetType } from '../constants/upload-policies';

export class CreatePresignedUrlDto {
  // ── Campos de política (obligatorios) ──────────────────────

  // Tipo de activo: define la política de MIME, tamaño y ruta a aplicar
  @IsEnum(AssetType, {
    message: `assetType debe ser uno de: ${Object.values(AssetType).join(', ')}`,
  })
  assetType!: AssetType;

  // MIME Type declarado por el cliente (se valida contra la política)
  @IsString()
  @IsNotEmpty()
  contentType!: string;

  // Tamaño en bytes declarado por el cliente (se valida contra el límite de la política).
  // Cloudflare R2 usará este valor para verificar el Content-Length en el PUT.
  @IsInt()
  @Min(1)
  fileSizeBytes!: number;

  // ── Contexto de negocio ────────────────────────────────────

  // ID de la organización/banda — requerido para activos org-scoped
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  orgId?: string;

  // ID de la canción — requerido para audio tracks y partituras
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  songId?: string;

  // ID del evento — requerido para recibos, archivos técnicos y videos
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  eventId?: string;

  // Identificador del archivo individual (UUID generado por el cliente).
  // Ignorado si la política usa serverGeneratesFileId = true.
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  fileId?: string;

  // ── Metadatos de visualización y búsqueda ─────────────────
  // El backend sanitiza y persiste estos valores en la tabla Asset.

  // Nombre legible para mostrar en la UI: "Afiche Temporada 2026"
  // Preserva acentos y espacios (es para mostrar, no para rutas).
  @IsString()
  @IsOptional()
  @MaxLength(256)
  displayName?: string;

  // Nombre original del archivo en el dispositivo del usuario.
  // Útil para búsqueda y para ayudar al usuario a identificar qué subió.
  @IsString()
  @IsOptional()
  @MaxLength(512)
  originalName?: string;

  // Descripción libre del contenido del archivo.
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  // Etiquetas de clasificación libre: ["temporada-2026", "urgente", "en-revision"]
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  // Código de idioma ISO 639-1 del contenido (para partituras y documentos).
  @IsString()
  @IsOptional()
  @MaxLength(10)
  language?: string;

  // Si es true, el objeto será servido desde el CDN público sin firma.
  // Solo aplica para tipos públicos (avatares, banners).
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  // ── Metadatos técnicos opcionales ────────────────────────
  // Proporcionados por el cliente cuando los conoce antes de subir.

  // Duración en segundos del audio/video
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

  // Número de páginas (PDFs / partituras)
  @IsInt()
  @Min(1)
  @Max(9999)
  @IsOptional()
  pageCount?: number;
}
