import { IsNotEmpty, IsString } from 'class-validator';

export class AddPassengerDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
