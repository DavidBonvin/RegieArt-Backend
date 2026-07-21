import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdatePickupPointDto {
  @IsDateString()
  @IsOptional()
  time?: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  address?: string;

  @IsNumber()
  @IsOptional()
  lat?: number;

  @IsNumber()
  @IsOptional()
  lng?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  order?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
