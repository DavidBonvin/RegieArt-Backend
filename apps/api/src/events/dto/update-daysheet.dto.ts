import { IsString, IsOptional } from 'class-validator';

export class UpdateDaysheetDto {
  @IsString()
  @IsOptional()
  daysheetNotes?: string;

  @IsString()
  @IsOptional()
  itineraryNotes?: string;
}
