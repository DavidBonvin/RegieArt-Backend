import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ScheduleType } from './create-schedule-item.dto';

export class UpdateScheduleItemDto {
  @IsEnum(ScheduleType)
  @IsOptional()
  type?: ScheduleType;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  title?: string;

  @IsDateString()
  @IsOptional()
  startTime?: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  location?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  withWho?: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;
}
