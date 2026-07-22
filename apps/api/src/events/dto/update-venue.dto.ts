import {
  IsString,
  IsOptional,
  IsInt,
  IsEmail,
  IsNumber,
  Min,
} from 'class-validator';

export class UpdateVenueDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  parkingNotes?: string;

  @IsString()
  @IsOptional()
  loadInNotes?: string;

  @IsString()
  @IsOptional()
  technicalContactName?: string;

  @IsString()
  @IsOptional()
  technicalContactPhone?: string;

  @IsEmail()
  @IsOptional()
  technicalContactEmail?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  timezone?: string;  // IANA: "America/Toronto", "Europe/Paris"
}
