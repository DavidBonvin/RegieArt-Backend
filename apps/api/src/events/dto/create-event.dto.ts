import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
  IsInt,
  Min,
} from 'class-validator';

export enum EventType {
  CONCERT = 'CONCERT',
  REHEARSAL = 'REHEARSAL',
  AUDITION = 'AUDITION',
  TOUR_DATE = 'TOUR_DATE',
  RECORDING_SESSION = 'RECORDING_SESSION',
}

export class CreateEventDto {
  @IsString()
  @IsNotEmpty()
  orgId: string;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEnum(EventType)
  type: EventType;

  @IsDateString()
  startTime: string;

  @IsDateString()
  @IsOptional()
  endTime?: string;

  @IsString()
  @IsOptional()
  venueId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsString()
  @IsOptional()
  daysheetNotes?: string;

  @IsString()
  @IsOptional()
  itineraryNotes?: string;

  @IsString()
  @IsOptional()
  setlistNotes?: string;
}
