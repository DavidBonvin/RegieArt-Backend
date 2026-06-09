// ============================================================
// DTO para actualizar los metadatos de un Asset existente.
// Todos los campos son opcionales (PATCH parcial).
// ============================================================

import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateAssetDto {
  // Nombre legible para mostrar en la UI
  @IsString()
  @IsOptional()
  @MaxLength(256)
  displayName?: string;

  // Descripción libre del contenido
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  // Etiquetas de clasificación (reemplaza las existentes)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  // Código de idioma ISO 639-1
  @IsString()
  @IsOptional()
  @MaxLength(10)
  language?: string;

  // Visibilidad pública (avatares, banners)
  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;
}
