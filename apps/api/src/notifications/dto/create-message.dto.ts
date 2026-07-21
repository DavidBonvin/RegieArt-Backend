import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  recipientId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  @IsString()
  @IsOptional()
  orgId?: string;
}
