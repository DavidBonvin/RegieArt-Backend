import { IsEnum, IsOptional, IsDateString } from 'class-validator';
import { MemberRole } from '@regieart/types';

export class CreateInviteLinkDto {
  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole = MemberRole.MEMBER;

  @IsDateString()
  @IsOptional()
  expiresAt?: string; // ISO 8601 — default 7 días si no se provee
}
