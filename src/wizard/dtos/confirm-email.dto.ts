import { IsString, IsNotEmpty, IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailDto {
  @ApiProperty({
    example: 'juan@example.com',
    description: 'Email del usuario a confirmar',
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({
    example: 'abc123def456',
    description: 'Token de confirmación recibido por email',
  })
  @IsString()
  @IsNotEmpty()
  confirmationToken: string;
}
