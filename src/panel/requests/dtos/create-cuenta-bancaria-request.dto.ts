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

class CompanyAddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

class OwnerPersonalAddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateCuentaBancariaRequestDto {
  // Paso 1: Información del Solicitante
  @IsOptional()
  @IsEmail()
  applicantEmail?: string;

  @IsOptional()
  @IsString()
  applicantFirstName?: string;

  @IsOptional()
  @IsString()
  applicantPaternalLastName?: string;

  @IsOptional()
  @IsString()
  applicantMaternalLastName?: string;

  @IsOptional()
  @IsString()
  applicantPhone?: string;

  @IsOptional()
  @IsString()
  accountType?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  legalBusinessIdentifier?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsString()
  economicActivity?: string;

  @IsOptional()
  @IsString()
  ein?: string;

  @IsOptional()
  @IsString()
  certificateOfConstitutionOrArticlesUrl?: string;

  @IsOptional()
  @IsString()
  operatingAgreementUrl?: string;

  // Paso 2: Dirección del Registro
  @IsOptional()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  @IsObject()
  companyAddress?: CompanyAddressDto;

  @IsOptional()
  @IsBoolean()
  isRegisteredAgentInUSA?: boolean;

  @IsOptional()
  @IsString()
  registeredAgentName?: string;

  @IsOptional()
  @IsString()
  registeredAgentAddress?: string;

  // Paso 3: Información de la cuenta bancaria
  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  swiftBicAba?: string;

  @IsOptional()
  @IsString()
  accountNumber?: string;

  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @IsOptional()
  @IsDateString()
  firstRegistrationDate?: string;

  @IsOptional()
  @IsBoolean()
  hasLitigatedCurrentFiscalYear?: boolean;

  @IsOptional()
  @IsString()
  litigationDetails?: string;

  // Paso 4: Dirección Personal del Propietario
  @IsOptional()
  @IsBoolean()
  isSameAddressAsBusiness?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerPersonalAddressDto)
  @IsObject()
  ownerPersonalAddress?: OwnerPersonalAddressDto;

  @IsOptional()
  @IsString()
  proofOfAddressUrl?: string;

  // Paso 5: Tipo de LLC
  @IsOptional()
  @IsIn(['single', 'multi'])
  llcType?: 'single' | 'multi';

  // Paso 7: Confirmación y Firma Electrónica
  @IsOptional()
  @IsString()
  documentCertification?: string;

  @IsOptional()
  @IsBoolean()
  acceptsTermsAndConditions?: boolean;
}

