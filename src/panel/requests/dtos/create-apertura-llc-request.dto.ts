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
import { CreateMemberDto } from './create-member.dto';

class RegisteredAgentAddressDto {
  @IsString()
  @IsNotEmpty()
  street: string;

  @IsOptional()
  @IsString()
  building?: string;

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
  building?: string;

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

export class CreateAperturaLlcRequestDto {
  // Paso 1: Información de la LLC
  @IsOptional()
  @IsString()
  llcName?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  llcPhoneNumber?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsEmail()
  llcEmail?: string;

  @IsOptional()
  @IsString()
  incorporationState?: string;

  @IsOptional()
  @IsDateString()
  incorporationDate?: string;

  @IsOptional()
  @IsBoolean()
  hasEin?: boolean;

  @IsOptional()
  @IsString()
  einNumber?: string;

  @IsOptional()
  @IsString()
  einDocumentUrl?: string;

  @IsOptional()
  @IsString()
  noEinReason?: string;

  @IsOptional()
  @IsString()
  certificateOfFormationUrl?: string;

  // Paso 2: Dirección del Registered Agent
  @IsOptional()
  @ValidateNested()
  @Type(() => RegisteredAgentAddressDto)
  @IsObject()
  registeredAgentAddress?: RegisteredAgentAddressDto;

  @IsOptional()
  @IsString()
  registeredAgentName?: string;

  @IsOptional()
  @IsEmail()
  registeredAgentEmail?: string;

  @IsOptional()
  @IsString()
  registeredAgentPhone?: string;

  @IsOptional()
  @IsIn(['persona', 'empresa'])
  registeredAgentType?: 'persona' | 'empresa';

  // Paso 3: Información de la cuenta bancaria
  @IsOptional()
  @IsBoolean()
  needsBankVerificationHelp?: boolean;

  @IsOptional()
  @IsString()
  bankAccountType?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  bankRoutingNumber?: string;

  @IsOptional()
  @IsString()
  bankStatementUrl?: string;

  // Paso 4: Dirección Personal del Propietario
  @IsOptional()
  @IsString()
  ownerNationality?: string;

  @IsOptional()
  @IsString()
  ownerCountryOfResidence?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OwnerPersonalAddressDto)
  @IsObject()
  ownerPersonalAddress?: OwnerPersonalAddressDto;

  @IsOptional()
  @IsString()
  ownerPhoneNumber?: string;

  @IsOptional()
  @IsEmail()
  ownerEmail?: string;

  // Paso 5: Tipo de LLC
  @IsOptional()
  @IsIn(['single', 'multi'])
  llcType?: 'single' | 'multi';

  // Paso 6: Información de los Miembros
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateMemberDto)
  members?: CreateMemberDto[];
}

