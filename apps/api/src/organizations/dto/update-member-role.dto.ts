import { IsEnum, IsNotEmpty } from 'class-validator';
import { MemberRole } from '@regieart/types';

export class UpdateMemberRoleDto {
  @IsEnum(MemberRole)
  @IsNotEmpty()
  role: MemberRole;
}
