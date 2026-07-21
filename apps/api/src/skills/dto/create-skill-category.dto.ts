import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export enum SkillCategoryType {
  INSTRUMENT = 'INSTRUMENT',
  TECHNICAL  = 'TECHNICAL',
  MANAGEMENT = 'MANAGEMENT',
}

export class CreateSkillCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(SkillCategoryType)
  type: SkillCategoryType;

  @IsString()
  @IsOptional()
  icon?: string;
}
