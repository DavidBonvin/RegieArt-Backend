import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePickupPointDto {
  @IsDateString()
  time: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address: string;

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
