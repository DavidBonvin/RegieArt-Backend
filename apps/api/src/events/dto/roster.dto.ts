import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';

export enum AttendanceStatus {
  INVITED = 'INVITED',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
  NO_SHOW = 'NO_SHOW',
}

export class AddRosterMemberDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  role?: string; // "Trompeta", "Director Musical", "Técnico FOH"

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateRosterMemberDto {
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
