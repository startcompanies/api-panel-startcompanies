import { IsIn, IsString } from "class-validator";
import { ApiProperty } from '@nestjs/swagger'

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

  @IsIn(['ADMIN', "USER"])
  @ApiProperty({enum: ['ADMIN', 'USER']})
  type: string
}