import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export enum EntryType { INCOME = 'INCOME', EXPENSE = 'EXPENSE' }

export class CreateFinanceCategoryDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsEnum(EntryType)
  type: EntryType;

  @IsString()
  @IsOptional()
  icon?: string;
}
