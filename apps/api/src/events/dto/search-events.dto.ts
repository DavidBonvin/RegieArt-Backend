import { IsString, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { EventType } from './create-event.dto';
import { EventStatus } from './update-event.dto';

export class SearchEventsDto {
  @IsString()
  @IsOptional()
  orgId?: string;

  @IsEnum(EventType)
  @IsOptional()
  type?: EventType;

  @IsEnum(EventStatus)
  @IsOptional()
  status?: EventStatus;

  @IsString()
  @IsOptional()
  from?: string; // ISO 8601

  @IsString()
  @IsOptional()
  to?: string; // ISO 8601

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  page?: number = 1;

  @Transform(({ value }) => parseInt(value))
  @IsOptional()
  limit?: number = 20;
}
