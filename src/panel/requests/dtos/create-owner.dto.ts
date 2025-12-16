import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEmail,
} from 'class-validator';

export class CreateOwnerDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  paternalLastName: string;

  @IsString()
  @IsNotEmpty()
  maternalLastName: string;

  @IsDateString()
  @IsNotEmpty()
  dateOfBirth: string;

  @IsString()
  @IsNotEmpty()
  nationality: string;

  @IsString()
  @IsNotEmpty()
  passportOrNationalId: string;

  @IsString()
  @IsNotEmpty()
  identityDocumentUrl: string;

  @IsString()
  @IsNotEmpty()
  facialPhotographUrl: string;
}

