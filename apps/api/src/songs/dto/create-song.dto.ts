import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';

export class CreateSongDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  composer?: string;

  @IsString()
  @IsOptional()
  arranger?: string;

  @IsString()
  @IsOptional()
  genre?: string;

  @IsString()
  @IsOptional()
  musicalKey?: string;

  @IsNumber()
  @Min(20)
  @Max(400)
  @IsOptional()
  tempo?: number;

  @IsNumber()
  @IsOptional()
  durationSeconds?: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
