import {
  IsDateString,
  IsDecimal,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { EntryType } from './create-finance-category.dto';

export class CreateFinanceEntryDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsString()
  @IsOptional()
  categoryId?: string;

  @IsEnum(EntryType)
  type: EntryType;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser ISO 4217 (ej: EUR, CAD)' })
  @IsOptional()
  currency?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  proofAssetId?: string;

  @IsDateString()
  date: string;
}
