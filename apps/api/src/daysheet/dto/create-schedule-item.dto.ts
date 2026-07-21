import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export enum ScheduleType {
  DEPARTURE       = 'DEPARTURE',
  ARRIVAL         = 'ARRIVAL',
  LOAD_IN         = 'LOAD_IN',
  SOUNDCHECK      = 'SOUNDCHECK',
  DOORS_OPEN      = 'DOORS_OPEN',
  CATERING_DINNER = 'CATERING_DINNER',
  SHOWTIME        = 'SHOWTIME',
  LOAD_OUT        = 'LOAD_OUT',
  OTHER           = 'OTHER',
}

export class CreateScheduleItemDto {
  @IsEnum(ScheduleType)
  type: ScheduleType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsDateString()
  startTime: string;

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
}
