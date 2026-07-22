import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEmail,
  IsNumber,
  Min,
} from 'class-validator';

export class CreateVenueDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsOptional()
  country?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  capacity?: number;

  // Geolocalización para clima y mapas
  @IsNumber()
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @IsOptional()
  longitude?: number;

  // Logística operacional
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
