import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEmail,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateBankAccountValidatorDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del validador' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del validador' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: '1990-01-15', description: 'Fecha de nacimiento (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ example: 'Mexicana', description: 'Nacionalidad del validador' })
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiProperty({ example: 'Mexicana', description: 'Ciudadanía del validador' })
  @IsString()
  @IsNotEmpty()
  citizenship: string;

  @ApiProperty({ example: 'A1234567', description: 'Número de pasaporte' })
  @IsString()
  @IsNotEmpty()
  passportNumber: string;

  @ApiProperty({ example: 'https://example.com/pasaporte.pdf', description: 'URL del pasaporte escaneado' })
  @IsString()
  @IsNotEmpty()
  scannedPassportUrl: string;

  @ApiProperty({ example: 'juan@example.com', description: 'Email de trabajo del validador' })
  @IsEmail()
  @IsNotEmpty()
  workEmail: string;

  @ApiProperty({ example: true, description: 'Indica si se debe usar el email para Relay login' })
  @IsBoolean()
  useEmailForRelayLogin: boolean;

  @ApiProperty({ example: '+1234567890', description: 'Número de teléfono del validador' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: true, description: 'Indica si puede recibir SMS' })
  @IsBoolean()
  canReceiveSMS: boolean;

  @ApiProperty({ example: false, description: 'Indica si es residente de USA' })
  @IsBoolean()
  @IsNotEmpty()
  isUSResident: boolean;
}

