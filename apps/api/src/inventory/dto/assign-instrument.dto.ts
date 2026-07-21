import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AssignInstrumentDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  eventId?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}
