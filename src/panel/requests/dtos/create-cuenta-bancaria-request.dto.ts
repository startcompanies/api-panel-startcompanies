import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  IsObject,
  ValidateNested,
  IsDateString,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CompanyAddressDto {
  @ApiProperty({ example: '123 Main St', description: 'Calle' })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiPropertyOptional({ example: 'Suite 100', description: 'Unidad o suite' })
  @IsOptional()
  @IsString()
  unit?: string;

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

  @ApiPropertyOptional({ example: 'Apt 2B', description: 'Unidad o apartamento' })
  @IsOptional()
  @IsString()
  unit?: string;

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

export class CreateCuentaBancariaRequestDto {
  // Paso 1: Información del Solicitante
  @ApiPropertyOptional({ example: 'applicant@example.com', description: 'Email del solicitante' })
  @IsOptional()
  @IsEmail()
  applicantEmail?: string;

  @ApiPropertyOptional({ example: 'Juan', description: 'Nombre del solicitante' })
  @IsOptional()
  @IsString()
  applicantFirstName?: string;

  @ApiPropertyOptional({ example: 'Pérez', description: 'Apellido paterno del solicitante' })
  @IsOptional()
  @IsString()
  applicantPaternalLastName?: string;

  @ApiPropertyOptional({ example: 'García', description: 'Apellido materno del solicitante' })
  @IsOptional()
  @IsString()
  applicantMaternalLastName?: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Teléfono del solicitante' })
  @IsOptional()
  @IsString()
  applicantPhone?: string;

  @ApiPropertyOptional({ example: 'Business Checking', description: 'Tipo de cuenta' })
  @IsOptional()
  @IsString()
  accountType?: string;

  @ApiPropertyOptional({ example: 'LLC', description: 'Tipo de negocio' })
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional({ example: '123456789', description: 'Identificador legal del negocio' })
  @IsOptional()
  @IsString()
  legalBusinessIdentifier?: string;

  @ApiPropertyOptional({ example: 'Technology', description: 'Industria' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Software development', description: 'Actividad económica' })
  @IsOptional()
  @IsString()
  economicActivity?: string;

  @ApiPropertyOptional({ example: '12-3456789', description: 'Número de EIN' })
  @IsOptional()
  @IsString()
  ein?: string;

  @ApiPropertyOptional({ example: 'https://example.com/certificate.pdf', description: 'URL del certificado de constitución o artículos' })
  @IsOptional()
  @IsString()
  certificateOfConstitutionOrArticlesUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/agreement.pdf', description: 'URL del Operating Agreement' })
  @IsOptional()
  @IsString()
  operatingAgreementUrl?: string;

  // Paso 2: Dirección del Registro
  @ApiPropertyOptional({ type: CompanyAddressDto, description: 'Dirección de la empresa' })
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  @IsObject()
  companyAddress?: CompanyAddressDto;

  @ApiPropertyOptional({ example: true, description: 'Indica si el Registered Agent está en USA' })
  @IsOptional()
  @IsBoolean()
  isRegisteredAgentInUSA?: boolean;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Nombre del Registered Agent' })
  @IsOptional()
  @IsString()
  registeredAgentName?: string;

  @ApiPropertyOptional({ example: '123 Main St, New York, NY 10001', description: 'Dirección del Registered Agent' })
  @IsOptional()
  @IsString()
  registeredAgentAddress?: string;

  // Paso 3: Información de la cuenta bancaria
  @ApiPropertyOptional({ example: 'Chase Bank', description: 'Nombre del banco' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: '021000021', description: 'SWIFT, BIC o ABA del banco' })
  @IsOptional()
  @IsString()
  swiftBicAba?: string;

  @ApiPropertyOptional({ example: '1234567890', description: 'Número de cuenta bancaria' })
  @IsOptional()
  @IsString()
  accountNumber?: string;

  @ApiPropertyOptional({ example: 'Checking', description: 'Tipo de cuenta bancaria' })
  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @ApiPropertyOptional({ example: '2024-01-15', description: 'Fecha del primer registro (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  firstRegistrationDate?: string;

  @ApiPropertyOptional({ example: false, description: 'Indica si ha litigado en el año fiscal actual' })
  @IsOptional()
  @IsBoolean()
  hasLitigatedCurrentFiscalYear?: boolean;

  @ApiPropertyOptional({ example: 'No litigation', description: 'Detalles de litigios si aplica' })
  @IsOptional()
  @IsString()
  litigationDetails?: string;

  // Paso 4: Dirección Personal del Propietario
  @ApiPropertyOptional({ example: false, description: 'Indica si la dirección personal es la misma que la del negocio' })
  @IsOptional()
  @IsBoolean()
  isSameAddressAsBusiness?: boolean;

  @ApiPropertyOptional({ type: OwnerPersonalAddressDto, description: 'Dirección personal del propietario' })
  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerPersonalAddressDto)
  @IsObject()
  ownerPersonalAddress?: OwnerPersonalAddressDto;

  @ApiPropertyOptional({ example: 'https://example.com/address.pdf', description: 'URL del comprobante de domicilio' })
  @IsOptional()
  @IsString()
  proofOfAddressUrl?: string;

  // Paso 5: Tipo de LLC
  @ApiPropertyOptional({ enum: ['single', 'multi'], example: 'single', description: 'Tipo de LLC (single o multi miembro)' })
  @IsOptional()
  @IsIn(['single', 'multi'])
  llcType?: 'single' | 'multi';

  // Paso 7: Confirmación y Firma Electrónica
  @ApiPropertyOptional({ example: 'Certified', description: 'Certificación del documento' })
  @IsOptional()
  @IsString()
  documentCertification?: string;

  @ApiPropertyOptional({ example: true, description: 'Indica si acepta términos y condiciones' })
  @IsOptional()
  @IsBoolean()
  acceptsTermsAndConditions?: boolean;
}

