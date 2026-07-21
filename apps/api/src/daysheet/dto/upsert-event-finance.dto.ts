import {
  IsBoolean,
  IsDecimal,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpsertEventFinanceDto {
  // Monto total del caché (cobro del grupo por el evento)
  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  cacheTotal?: string; // string para compatibilidad con class-validator Decimal

  // Viático estándar por músico
  @IsDecimal({ decimal_digits: '0,2' })
  @IsOptional()
  perDiemAmount?: string;

  // Código ISO 4217: "EUR", "CAD", "USD"
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency debe ser un código ISO 4217 (3 letras, ej: EUR)' })
  @IsOptional()
  currency?: string;

  @IsBoolean()
  @IsOptional()
  isPaid?: boolean;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  paymentNotes?: string;

  // ID del Asset PDF de la factura/contrato almacenado en R2
  @IsString()
  @IsOptional()
  invoiceAssetId?: string;
}
