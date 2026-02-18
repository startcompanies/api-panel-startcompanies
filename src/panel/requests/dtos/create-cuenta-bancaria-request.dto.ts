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

  @ApiPropertyOptional({ example: 'https://example.com/ein-letter.pdf', description: 'URL del documento EIN Letter' })
  @IsOptional()
  @IsString()
  einLetterUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/certificate.pdf', description: 'URL del certificado de constitución o artículos' })
  @IsOptional()
  @IsString()
  certificateOfConstitutionOrArticlesUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/articles.pdf', description: 'URL de Articles de Organización o Certificate of Formation (alias para certificateOfConstitutionOrArticlesUrl)' })
  @IsOptional()
  @IsString()
  articlesOrCertificateUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/service-bill.pdf', description: 'URL de la factura de servicio (alias para proofOfAddressUrl)' })
  @IsOptional()
  @IsString()
  serviceBillUrl?: string;

  @ApiPropertyOptional({ example: 'https://example.com/validator-passport.pdf', description: 'URL del pasaporte del validador (se guarda en BankAccountValidator)' })
  @IsOptional()
  @IsString()
  validatorPassportUrl?: string;

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

  // Paso 4: Dirección Personal del Propietario

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

  @ApiPropertyOptional({ enum: ['yes', 'no'], example: 'yes', description: 'Indica si la LLC es Multi-Member (yes/no). Se mapea a llcType en el backend.' })
  @IsOptional()
  @IsIn(['yes', 'no'])
  isMultiMember?: 'yes' | 'no';
}

