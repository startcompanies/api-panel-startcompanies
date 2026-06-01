import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdatePanelStaffDto {
  @ApiProperty({ example: 'Juan', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  first_name?: string;

  @ApiProperty({ example: 'Pérez', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  last_name?: string;

  @ApiProperty({ example: 'admin', enum: ['admin', 'user'], required: false })
  @IsOptional()
  @IsIn(['admin', 'user'], { message: 'El rol debe ser admin o user' })
  type?: 'admin' | 'user';

  @ApiProperty({ example: 'Mi Empresa', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  company?: string;

  @ApiProperty({ example: '+1234567890', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
