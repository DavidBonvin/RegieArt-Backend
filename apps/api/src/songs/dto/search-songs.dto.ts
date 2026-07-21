import { IsString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class SearchSongsDto {
  @IsString()
  @IsOptional()
  orgId?: string;

  @IsString()
  @IsOptional()
  search?: string; // busca en title, composer, arranger

  @IsString()
  @IsOptional()
  genre?: string;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  page?: number = 1;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  limit?: number = 20;
}
