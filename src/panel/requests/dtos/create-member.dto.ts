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

class MemberAddressDto {
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
  stateRegion: string;

  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @IsString()
  @IsNotEmpty()
  country: string;
}

export class CreateMemberDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  passportNumber: string;

  @IsString()
  @IsNotEmpty()
  nationality: string;

  @IsOptional()
  @IsString()
  scannedPassportUrl?: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ValidateNested()
  @Type(() => MemberAddressDto)
  @IsObject()
  @IsNotEmpty()
  memberAddress: MemberAddressDto;

  @IsNumber()
  @Min(0)
  @Max(100)
  percentageOfParticipation: number;

  @IsBoolean()
  validatesBankAccount: boolean;

  @IsOptional()
  @IsString()
  additionalBankDocsUrl?: string;

  // Campos adicionales para Renovación LLC
  @IsOptional()
  @IsString()
  ssnOrItin?: string;

  @IsOptional()
  @IsString()
  nationalTaxId?: string;

  @IsOptional()
  @IsString()
  taxFilingCountry?: string;

  @IsOptional()
  @IsNumber()
  ownerContributions2024?: number;

  @IsOptional()
  @IsNumber()
  ownerLoansToLLC2024?: number;

  @IsOptional()
  @IsNumber()
  loansReimbursedByLLC2024?: number;

  @IsOptional()
  @IsNumber()
  profitDistributions2024?: number;

  @IsOptional()
  @IsString()
  spentMoreThan31DaysInUS?: string;

  @IsOptional()
  @IsString()
  hasUSFinancialInvestments?: string;

  @IsOptional()
  @IsString()
  isUSCitizen?: string;
}

