import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateVehicleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  driverName?: string;

  @IsString()
  @MaxLength(30)
  @IsOptional()
  driverPhone?: string;

  @IsString()
  @MaxLength(20)
  @IsOptional()
  plateNumber?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
