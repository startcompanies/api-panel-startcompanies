import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsNumber,
  IsBoolean,
  IsOptional,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class MemberAddressDto {
  @ApiProperty({ example: '123 Main St', description: 'Calle' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: 'Apt 4B', description: 'Unidad o apartamento' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 'New York', description: 'Ciudad' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'New York', description: 'Estado o región' })
  @IsString()
  @IsNotEmpty()
  stateRegion: string;

  @ApiProperty({ example: '10001', description: 'Código postal' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: 'United States', description: 'País' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateMemberDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del miembro' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del miembro' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'A1234567', description: 'Número de pasaporte completo' })
  @IsString()
  @IsNotEmpty()
  passportNumber: string;

  @ApiProperty({ example: 'Mexicana', description: 'Nacionalidad del miembro' })
  @IsString()
  @IsNotEmpty()
  nationality: string;

  @ApiPropertyOptional({ example: 'https://example.com/pasaporte.pdf', description: 'URL del pasaporte escaneado' })
  @IsOptional()
  @IsString()
  scannedPassportUrl?: string;

  @ApiProperty({ example: '1990-01-15', description: 'Fecha de nacimiento (YYYY-MM-DD)' })
  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @ApiProperty({ example: 'juan@example.com', description: 'Email del miembro' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+1234567890', description: 'Número de teléfono del miembro' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ type: MemberAddressDto, description: 'Dirección del miembro' })
  @ValidateNested()
  @Type(() => MemberAddressDto)
  @IsObject()
  @IsNotEmpty()
  memberAddress: MemberAddressDto;

  @ApiProperty({ example: 50, description: 'Porcentaje de participación (0-100)', minimum: 0, maximum: 100 })
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageOfParticipation: number;

  @ApiProperty({ example: false, description: 'Indica si este miembro valida la cuenta bancaria' })
  @IsBoolean()
  validatesBankAccount: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/bank-docs.pdf', description: 'URL de documentos bancarios adicionales' })
  @IsOptional()
  @IsString()
  additionalBankDocsUrl?: string;

  // Campos adicionales para Renovación LLC
  @ApiPropertyOptional({ example: '123-45-6789', description: 'SSN o ITIN del miembro (solo para renovación)' })
  @IsOptional()
  @IsString()
  ssnOrItin?: string;

  @ApiPropertyOptional({ example: 'TAX123456', description: 'ID de impuestos nacional (solo para renovación)' })
  @IsOptional()
  @IsString()
  nationalTaxId?: string;

  @ApiPropertyOptional({ example: 'United States', description: 'País donde presenta impuestos (solo para renovación)' })
  @IsOptional()
  @IsString()
  taxFilingCountry?: string;

  @ApiPropertyOptional({ example: 10000, description: 'Contribuciones del propietario (solo para renovación)' })
  @IsOptional()
  @IsNumber()
  ownerContributions?: number;

  @ApiPropertyOptional({ example: 5000, description: 'Préstamos del propietario a la LLC (solo para renovación)' })
  @IsOptional()
  @IsNumber()
  ownerLoansToLLC?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Préstamos reembolsados por la LLC (solo para renovación)' })
  @IsOptional()
  @IsNumber()
  loansReimbursedByLLC?: number;

  @ApiPropertyOptional({ example: 3000, description: 'Distribuciones de ganancias (solo para renovación)' })
  @IsOptional()
  @IsNumber()
  profitDistributions?: number;

  @ApiPropertyOptional({ example: 'No', description: '¿Pasó más de 31 días en USA? (solo para renovación)' })
  @IsOptional()
  @IsString()
  spentMoreThan31DaysInUS?: string;

  @ApiPropertyOptional({ example: 'No', description: '¿Tiene inversiones financieras en USA? (solo para renovación)' })
  @IsOptional()
  @IsString()
  hasUSFinancialInvestments?: string;

  @ApiPropertyOptional({ example: 'No', description: '¿Es ciudadano estadounidense? (solo para renovación)' })
  @IsOptional()
  @IsString()
  isUSCitizen?: string;
}

