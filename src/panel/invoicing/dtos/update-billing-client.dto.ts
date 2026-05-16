import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateBillingClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(240)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ein?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v != null && String(v).trim() !== '')
  @IsEmail()
  @MaxLength(180)
  email?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string | null;
}
