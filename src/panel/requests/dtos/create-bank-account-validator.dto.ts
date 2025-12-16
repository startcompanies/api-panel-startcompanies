import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEmail,
  IsBoolean,
} from 'class-validator';

export class CreateBankAccountValidatorDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty()
  nationality: string;

  @IsString()
  @IsNotEmpty()
  citizenship: string;

  @IsString()
  @IsNotEmpty()
  passportNumber: string;

  @IsString()
  @IsNotEmpty()
  scannedPassportUrl: string;

  @IsEmail()
  @IsNotEmpty()
  workEmail: string;

  @IsBoolean()
  useEmailForRelayLogin: boolean;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsBoolean()
  canReceiveSMS: boolean;

  @IsBoolean()
  @IsNotEmpty()
  isUSResident: boolean;
}

