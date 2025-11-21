import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignUpDto {
  @IsString()
  @ApiProperty()
  username: string;

  @IsString()
  @ApiProperty()
  email: string;

  @IsString()
  @ApiProperty()
  password: string;

  @IsIn(['ADMIN', 'USER'])
  @ApiProperty({ enum: ['ADMIN', 'USER'] })
  type: string;

  @ApiProperty({ example: 'Jhon', description: 'Nombre(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El nombre no puede estar vacio' })
  first_name: string;

  @ApiProperty({ example: 'Smith', description: 'Apellido(s) del usuario' })
  @IsString()
  @IsNotEmpty({ message: 'El apellido no puede estar vacio' })
  last_name: string;
}
