// ============================================================
// DTO para búsqueda de assets con filtros múltiples.
// Todos los parámetros son opcionales y se combinan con AND.
// ============================================================

import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AssetType } from '../constants/upload-policies';

export class SearchAssetsDto {
  // Texto libre (busca en displayName, originalName y description)
  @IsString()
  @IsOptional()
  q?: string;

  // Filtrar por tipo de activo (se puede pasar múltiples: ?assetType=audio-track&assetType=music-score)
  @IsEnum(AssetType, { each: true })
  @IsArray()
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  assetType?: AssetType[];

  // Filtrar por organización
  @IsString()
  @IsOptional()
  orgId?: string;

  // Filtrar por canción del repertorio
  @IsString()
  @IsOptional()
  songId?: string;

  // Filtrar por evento
  @IsString()
  @IsOptional()
  eventId?: string;

  // Filtrar por tags (todos los tags deben estar presentes en el asset)
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : [value]))
  tags?: string[];

  // Filtrar por idioma
  @IsString()
  @IsOptional()
  language?: string;

  // Rango de fechas (ISO 8601)
  @IsISO8601()
  @IsOptional()
  createdFrom?: string;

  @IsISO8601()
  @IsOptional()
  createdTo?: string;

  // Paginación
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  // Ordenamiento
  @IsEnum(['createdAt', 'sizeBytes', 'displayName', 'confirmedAt'])
  @IsOptional()
  orderBy?: 'createdAt' | 'sizeBytes' | 'displayName' | 'confirmedAt' = 'createdAt';

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  order?: 'asc' | 'desc' = 'desc';
}
