import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export enum ExpertiseLevel {
  BEGINNER     = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED     = 'ADVANCED',
  PROFESSIONAL = 'PROFESSIONAL',
}

export class AddUserSkillDto {
  @IsString()
  @IsNotEmpty()
  skillCategoryId: string;

  @IsEnum(ExpertiseLevel)
  @IsOptional()
  expertiseLevel?: ExpertiseLevel;

  @IsInt()
  @Min(0)
  @IsOptional()
  yearsExp?: number;
}
