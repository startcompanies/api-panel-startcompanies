import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInResendOtpDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  challengeId: string;
}
