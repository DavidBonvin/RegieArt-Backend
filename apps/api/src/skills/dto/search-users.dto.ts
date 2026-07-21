import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchUsersDto {
  @IsString()
  @IsOptional()
  skill?: string;   // nombre o ID de SkillCategory

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  orgId?: string;

  @IsString()
  @IsOptional()
  q?: string;       // búsqueda libre en displayName

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  page?: number = 1;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  limit?: number = 20;
}
