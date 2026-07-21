import { IsDateString, IsDecimal, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateFinanceEntryDto {
  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  amount?: string;

  @IsString()
  @Matches(/^[A-Z]{3}$/)
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
  @IsOptional()
  date?: string;
}
