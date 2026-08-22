import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
} from 'class-validator';
import { MemberRole } from '@regieart/types';

export class SendInvitationDto {
  @IsEmail()
  email: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole = MemberRole.MEMBER;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  instrument?: string; // e.g. "Piano", "Guitarra eléctrica"

  @IsString()
  @IsOptional()
  @MaxLength(500)
  personalMessage?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string; // ISO 8601 — default 7 días
}
