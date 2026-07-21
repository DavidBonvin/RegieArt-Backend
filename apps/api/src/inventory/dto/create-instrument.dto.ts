import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum InstrumentType {
  BRASS      = 'BRASS',
  WOODWIND   = 'WOODWIND',
  STRING     = 'STRING',
  KEYBOARD   = 'KEYBOARD',
  PERCUSSION = 'PERCUSSION',
  AUDIO_GEAR = 'AUDIO_GEAR',
  LIGHTING   = 'LIGHTING',
  OTHER      = 'OTHER',
}

export class CreateInstrumentDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(InstrumentType)
  type: InstrumentType;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  brand?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  model?: string;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  serialNumber?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  specAssetId?: string;
}
