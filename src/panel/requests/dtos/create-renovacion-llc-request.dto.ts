import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsEmail,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateMemberDto } from './create-member.dto';

class ResponsiblePersonDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre de la persona responsable' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido de la persona responsable' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'United States', description: 'País de la persona responsable' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: '123 Main St, New York, NY 10001', description: 'Dirección de la persona responsable' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'juan@example.com', description: 'Email de la persona responsable' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '+1234567890', description: 'Teléfono de la persona responsable' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

class RegisteredAgentInfoDto {
  @ApiProperty({ example: 'John Doe', description: 'Nombre del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '123 Main St', description: 'Dirección del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: 'United States', description: 'País del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  country: string;

  @ApiProperty({ example: 'New York', description: 'Ciudad del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: '10001', description: 'Código postal del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: '+1234567890', description: 'Teléfono del Registered Agent' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: 'agent@example.com', description: 'Email del Registered Agent' })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class CreateRenovacionLlcRequestDto {
  // Paso 1: Datos Generales de la LLC
  @ApiPropertyOptional({ example: 'My Company LLC', description: 'Nombre de la LLC' })
  @IsOptional()
  @IsString()
  llcName?: string;

  @ApiPropertyOptional({ example: 'LLC', description: 'Tipo de sociedad' })
  @IsOptional()
  @IsString()
  societyType?: string;

  @ApiPropertyOptional({ example: '123456789', description: 'Número de registro' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiPropertyOptional({ example: 'Delaware', description: 'Estado' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: false, description: 'Indica si hay cambios en datos o directores' })
  @IsOptional()
  @IsBoolean()
  hasDataOrDirectorsChanges?: boolean;

  @ApiPropertyOptional({ example: '123 Main St, New York, NY 10001', description: 'Dirección física' })
  @IsOptional()
  @IsString()
  physicalAddress?: string;

  @ApiPropertyOptional({ example: '123 Main St, New York, NY 10001', description: 'Dirección de correspondencia' })
  @IsOptional()
  @IsString()
  correspondenceAddress?: string;

  @ApiPropertyOptional({ example: 'United States', description: 'País' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'New York', description: 'Ciudad' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: '10001', description: 'Código postal' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Software development', description: 'Descripción de la actividad principal' })
  @IsOptional()
  @IsString()
  mainActivityDescription?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Teléfono de contacto' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'contact@example.com', description: 'Email de contacto' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: true, description: 'Indica si tiene EIN' })
  @IsOptional()
  @IsBoolean()
  hasEin?: boolean;

  @ApiPropertyOptional({ example: '12-3456789', description: 'Número de EIN' })
  @IsOptional()
  @IsString()
  einNumber?: string;

  @ApiPropertyOptional({ example: 'Technology Services', description: 'Actividad principal' })
  @IsOptional()
  @IsString()
  mainActivity?: string;

  @ApiPropertyOptional({ type: ResponsiblePersonDto, description: 'Información de la persona responsable' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ResponsiblePersonDto)
  @IsObject()
  responsiblePerson?: ResponsiblePersonDto;

  @ApiPropertyOptional({ example: true, description: 'Indica si quiere Registered Agent' })
  @IsOptional()
  @IsBoolean()
  wantsRegisteredAgent?: boolean;

  @ApiPropertyOptional({ type: RegisteredAgentInfoDto, description: 'Información del Registered Agent' })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisteredAgentInfoDto)
  @IsObject()
  registeredAgentInfo?: RegisteredAgentInfoDto;

  @ApiPropertyOptional({ example: 'https://example.com/id.pdf', description: 'URL del documento de identidad' })
  @IsOptional()
  @IsString()
  identityDocumentUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/address.pdf', description: 'URL del comprobante de domicilio' })
  @IsOptional()
  @IsString()
  proofOfAddressUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/contract.pdf', description: 'URL del contrato o Operating Agreement' })
  @IsOptional()
  @IsString()
  llcContractOrOperatingAgreementUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/articles.pdf', description: 'URL de los artículos de incorporación' })
  @IsOptional()
  @IsString()
  articlesOfIncorporationUrl?: string;

  // Paso 2: Información de los Miembros
  @ApiPropertyOptional({ type: [CreateMemberDto], description: 'Lista de miembros de la LLC' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  members?: CreateMemberDto[];

  // Paso 3: Domicilio Registrado
  @ApiPropertyOptional({ example: '123 Main St', description: 'Dirección registrada' })
  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @ApiPropertyOptional({ example: 'United States', description: 'País del domicilio registrado' })
  @IsOptional()
  @IsString()
  registeredCountry?: string;

  @ApiPropertyOptional({ example: 'Delaware', description: 'Estado del domicilio registrado' })
  @IsOptional()
  @IsString()
  registeredState?: string;

  @ApiPropertyOptional({ example: 'Wilmington', description: 'Ciudad del domicilio registrado' })
  @IsOptional()
  @IsString()
  registeredCity?: string;

  @ApiPropertyOptional({ example: '19801', description: 'Código postal del domicilio registrado' })
  @IsOptional()
  @IsString()
  registeredPostalCode?: string;

  // Paso 4: Documentación Anexa
  @ApiPropertyOptional({ example: 'https://example.com/contributions.pdf', description: 'URL de las contribuciones de capital' })
  @IsOptional()
  @IsString()
  capitalContributionsUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/registration.pdf', description: 'URL del registro estatal' })
  @IsOptional()
  @IsString()
  stateRegistrationUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/certificate.pdf', description: 'URL del certificado de buena reputación' })
  @IsOptional()
  @IsString()
  certificateOfGoodStandingUrl?: string;

  // Paso 5: Confirmación de Datos
  @ApiPropertyOptional({ example: true, description: 'Indica si los datos son correctos' })
  @IsOptional()
  @IsBoolean()
  dataIsCorrect?: boolean;

  @ApiPropertyOptional({ example: 'Sin observaciones', description: 'Observaciones adicionales' })
  @IsOptional()
  @IsString()
  observations?: string;

  // Paso 6: Pago y Envío
  @ApiPropertyOptional({ example: 'stripe', description: 'Método de pago' })
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 99.0, description: 'Monto a pagar' })
  @IsOptional()
  @IsNumber()
  amountToPay?: number;

  @ApiPropertyOptional({ example: true, description: 'Indica si quiere factura' })
  @IsOptional()
  @IsBoolean()
  wantsInvoice?: boolean;

  @ApiPropertyOptional({ example: 'https://example.com/payment.pdf', description: 'URL del comprobante de pago' })
  @IsOptional()
  @IsString()
  paymentProofUrl?: string;

  // Tipo de LLC
  @ApiPropertyOptional({ enum: ['single', 'multi'], example: 'single', description: 'Tipo de LLC (single o multi miembro)' })
  @IsOptional()
  @IsString()
  llcType?: 'single' | 'multi';
}

