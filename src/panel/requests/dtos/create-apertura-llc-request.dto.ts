import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEmail,
  IsIn,
  IsObject,
  ValidateNested,
  IsDateString,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto';

class RegisteredAgentAddressDto {
  @ApiProperty({ example: '123 Main St', description: 'Calle' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: 'Building A', description: 'Edificio' })
  @IsOptional()
  @IsString()
  building?: string;

  @ApiProperty({ example: 'New York', description: 'Ciudad' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'New York', description: 'Estado' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '10001', description: 'Código postal' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: 'United States', description: 'País' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

class OwnerPersonalAddressDto {
  @ApiProperty({ example: '456 Oak Ave', description: 'Calle' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: 'Apt 2B', description: 'Edificio o apartamento' })
  @IsOptional()
  @IsString()
  building?: string;

  @ApiProperty({ example: 'Los Angeles', description: 'Ciudad' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'California', description: 'Estado' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '90001', description: 'Código postal' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: 'United States', description: 'País' })
  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateAperturaLlcRequestDto {
  // Paso 1: Información de la LLC
  @ApiPropertyOptional({ example: 'My Company LLC', description: 'Nombre de la LLC' })
  @IsOptional()
  @IsString()
  llcName?: string;

  @ApiPropertyOptional({ example: 'Technology', description: 'Tipo de negocio' })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({ example: 'Software development services', description: 'Descripción del negocio' })
  @IsOptional()
  @IsString()
  businessDescription?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Número de teléfono de la LLC' })
  @IsOptional()
  @IsString()
  llcPhoneNumber?: string;

  @ApiPropertyOptional({ example: 'https://example.com', description: 'Sitio web de la LLC' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'contact@example.com', description: 'Email de la LLC' })
  @IsOptional()
  @IsEmail()
  llcEmail?: string;

  @ApiPropertyOptional({ example: 'Delaware', description: 'Estado de incorporación' })
  @IsOptional()
  @IsString()
  incorporationState?: string;

  @ApiPropertyOptional({
    example: 'Entrepreneur',
    description: 'Plan del servicio (Entrepreneur, Elite, Premium). Se guarda en el request para validaciones al recargar.',
  })
  @IsOptional()
  @IsString()
  plan?: string;

  @ApiPropertyOptional({ example: '2024-01-15', description: 'Fecha de incorporación (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  incorporationDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Indica si tiene EIN' })
  @IsOptional()
  @IsBoolean()
  hasEin?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/ein.pdf', description: 'URL del documento EIN' })
  @IsOptional()
  @IsString()
  einDocumentUrl?: string;

  @ApiPropertyOptional({ example: 'Pending application', description: 'Razón por la que no tiene EIN' })
  @IsOptional()
  @IsString()
  noEinReason?: string;

  @ApiPropertyOptional({ example: 'https://example.com/certificate.pdf', description: 'URL del certificado de formación' })
  @IsOptional()
  @IsString()
  certificateOfFormationUrl?: string;

  // Paso 2: Dirección del Registered Agent
  @ApiPropertyOptional({ type: RegisteredAgentAddressDto, description: 'Dirección del Registered Agent' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisteredAgentAddressDto)
  @IsObject()
  registeredAgentAddress?: RegisteredAgentAddressDto;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Nombre del Registered Agent' })
  @IsOptional()
  @IsString()
  registeredAgentName?: string;

  @ApiPropertyOptional({ example: 'agent@example.com', description: 'Email del Registered Agent' })
  @IsOptional()
  @IsEmail()
  registeredAgentEmail?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Teléfono del Registered Agent' })
  @IsOptional()
  @IsString()
  registeredAgentPhone?: string;

  @ApiPropertyOptional({ enum: ['persona', 'empresa'], example: 'persona', description: 'Tipo de Registered Agent' })
  @IsOptional()
  @IsIn(['persona', 'empresa'])
  registeredAgentType?: 'persona' | 'empresa';

  // Paso 3: Información de la cuenta bancaria
  @ApiPropertyOptional({ example: true, description: 'Indica si necesita ayuda con la verificación bancaria' })
  @IsOptional()
  @IsBoolean()
  needsBankVerificationHelp?: boolean;

  @ApiPropertyOptional({ example: 'Checking', description: 'Tipo de cuenta bancaria' })
  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Número de cuenta bancaria' })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: '021000021', description: 'Número de ruta bancaria' })
  @IsOptional()
  @IsString()
  bankRoutingNumber?: string;

  @ApiPropertyOptional({ example: 'https://example.com/statement.pdf', description: 'URL del estado de cuenta bancario' })
  @IsOptional()
  @IsString()
  bankStatementUrl?: string;

  // Campos adicionales para apertura bancaria (Sección 3)
  @ApiPropertyOptional({ example: 'https://example.com/service-bill.pdf', description: 'URL de la factura de servicio (prueba de dirección)' })
  @IsOptional()
  @IsString()
  serviceBillUrl?: string;

  @ApiPropertyOptional({ enum: ['si', 'no'], example: 'si', description: '¿Tendrá ingresos periódicos que suman USD 10,000 o más?' })
  @IsOptional()
  @IsIn(['si', 'no'])
  periodicIncome10k?: string;

  @ApiPropertyOptional({ example: 'bank@example.com', description: 'Correo electrónico vinculado a la cuenta bancaria' })
  @IsOptional()
  @IsEmail()
  bankAccountLinkedEmail?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Número de teléfono vinculado a la cuenta bancaria' })
  @IsOptional()
  @IsString()
  bankAccountLinkedPhone?: string;

  @ApiPropertyOptional({ example: 'https://example.com', description: 'URL del proyecto o empresa' })
  @IsOptional()
  @IsString()
  projectOrCompanyUrl?: string;

  // Paso 4: Dirección Personal del Propietario
  @ApiPropertyOptional({ example: 'Mexicana', description: 'Nacionalidad del propietario' })
  @IsOptional()
  @IsString()
  ownerNationality?: string;

  @ApiPropertyOptional({ example: 'United States', description: 'País de residencia del propietario' })
  @IsOptional()
  @IsString()
  ownerCountryOfResidence?: string;

  @ApiPropertyOptional({ type: OwnerPersonalAddressDto, description: 'Dirección personal del propietario' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerPersonalAddressDto)
  @IsObject()
  ownerPersonalAddress?: OwnerPersonalAddressDto;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Número de teléfono del propietario' })
  @IsOptional()
  @IsString()
  ownerPhoneNumber?: string;

  @ApiPropertyOptional({ example: 'owner@example.com', description: 'Email del propietario' })
  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  // Paso 5: Tipo de LLC
  @ApiPropertyOptional({ enum: ['single', 'multi'], example: 'single', description: 'Tipo de LLC (single o multi miembro)' })
  @IsOptional()
  @IsIn(['single', 'multi'])
  llcType?: 'single' | 'multi';

  // Paso 6: Información de los Miembros
  @ApiPropertyOptional({ type: [CreateMemberDto], description: 'Lista de miembros de la LLC' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  members?: CreateMemberDto[];
}

