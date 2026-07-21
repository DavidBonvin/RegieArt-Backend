import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { EntryType } from './create-finance-category.dto';

export enum ApprovalStatus { PENDING = 'PENDING', APPROVED = 'APPROVED', REJECTED = 'REJECTED' }

export class QueryFinanceDto {
  @IsString()
  @IsOptional()
  orgId?: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsEnum(EntryType)
  @IsOptional()
  type?: EntryType;

  @IsEnum(ApprovalStatus)
  @IsOptional()
  status?: ApprovalStatus;

  @IsISO8601()
  @IsOptional()
  from?: string;

  @IsISO8601()
  @IsOptional()
  to?: string;

  @Transform(({ value }: { value: string }) => parseInt(value))
  @IsOptional()
  page?: number = 1;

  @Transform(({ value }: { value: string }) => parseInt(value))
  @IsOptional()
  limit?: number = 20;
}
