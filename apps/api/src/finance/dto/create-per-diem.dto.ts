import {
  IsDecimal,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreatePerDiemDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217 (ej: EUR, CAD)' })
  @IsOptional()
  currency?: string;

  @IsString()
  @MaxLength(300)
  @IsOptional()
  description?: string;
}
