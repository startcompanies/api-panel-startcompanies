import { IsString, IsUUID, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInVerifyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  challengeId: string;

  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos' })
  @IsString()
  @Length(6, 6)
  code: string;
}
