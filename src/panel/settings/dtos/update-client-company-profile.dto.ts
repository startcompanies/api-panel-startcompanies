import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateClientCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(240)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  ein?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(180)
  billingEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  accountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  routingAch?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  swift?: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  zelleOrPaypal?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
