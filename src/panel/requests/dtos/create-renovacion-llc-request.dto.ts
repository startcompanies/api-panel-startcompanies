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
import { CreateMemberDto } from './create-member.dto';

class ResponsiblePersonDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;
}

class RegisteredAgentInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  country: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}

export class CreateRenovacionLlcRequestDto {
  // Paso 1: Datos Generales de la LLC
  @IsOptional()
  @IsString()
  llcName?: string;

  @IsOptional()
  @IsString()
  societyType?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsBoolean()
  hasDataOrDirectorsChanges?: boolean;

  @IsOptional()
  @IsString()
  physicalAddress?: string;

  @IsOptional()
  @IsString()
  correspondenceAddress?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  mainActivityDescription?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @IsOptional()
  @IsBoolean()
  hasEin?: boolean;

  @IsOptional()
  @IsString()
  einNumber?: string;

  @IsOptional()
  @IsString()
  mainActivity?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ResponsiblePersonDto)
  @IsObject()
  responsiblePerson?: ResponsiblePersonDto;

  @IsOptional()
  @IsBoolean()
  wantsRegisteredAgent?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => RegisteredAgentInfoDto)
  @IsObject()
  registeredAgentInfo?: RegisteredAgentInfoDto;

  @IsOptional()
  @IsString()
  identityDocumentUrl?: string;

  @IsOptional()
  @IsString()
  proofOfAddressUrl?: string;

  @IsOptional()
  @IsString()
  llcContractOrOperatingAgreementUrl?: string;

  @IsOptional()
  @IsString()
  articlesOfIncorporationUrl?: string;

  // Paso 2: Información de los Miembros
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  members?: CreateMemberDto[];

  // Paso 3: Domicilio Registrado
  @IsOptional()
  @IsString()
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  registeredCountry?: string;

  @IsOptional()
  @IsString()
  registeredState?: string;

  @IsOptional()
  @IsString()
  registeredCity?: string;

  @IsOptional()
  @IsString()
  registeredPostalCode?: string;

  // Paso 4: Documentación Anexa
  @IsOptional()
  @IsString()
  capitalContributionsUrl?: string;

  @IsOptional()
  @IsString()
  stateRegistrationUrl?: string;

  @IsOptional()
  @IsString()
  certificateOfGoodStandingUrl?: string;

  // Paso 5: Confirmación de Datos
  @IsOptional()
  @IsBoolean()
  dataIsCorrect?: boolean;

  @IsOptional()
  @IsString()
  observations?: string;

  // Paso 6: Pago y Envío
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsNumber()
  amountToPay?: number;

  @IsOptional()
  @IsBoolean()
  wantsInvoice?: boolean;

  @IsOptional()
  @IsString()
  paymentProofUrl?: string;

  // Tipo de LLC
  @IsOptional()
  @IsString()
  llcType?: 'single' | 'multi';
}

