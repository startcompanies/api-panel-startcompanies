import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEmail,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOwnerDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del propietario' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido paterno' })
  @IsString()
  @IsNotEmpty()
  paternalLastName: string;

  @ApiProperty({ example: 'García', description: 'Apellido materno' })
  @IsString()
  @IsNotEmpty()
  maternalLastName: string;

  @ApiProperty({ example: '1990-01-15', description: 'Fecha de nacimiento (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ example: 'Mexicana', description: 'Nacionalidad del propietario' })
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiProperty({ example: 'A1234567', description: 'Número de pasaporte o identificación nacional' })
  @IsString()
  @IsNotEmpty()
  passportOrNationalId: string;

  @ApiProperty({ example: 'https://example.com/documento.pdf', description: 'URL del documento de identidad escaneado' })
  @IsString()
  @IsNotEmpty()
  identityDocumentUrl: string;

  @ApiProperty({ example: 'https://example.com/foto.jpg', description: 'URL de la fotografía facial del propietario' })
  @IsString()
  @IsNotEmpty()
  facialPhotographUrl: string;
}

