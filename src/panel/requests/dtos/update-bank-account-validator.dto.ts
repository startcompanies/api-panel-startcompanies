import { PartialType } from '@nestjs/mapped-types';
import { CreateBankAccountValidatorDto } from './create-bank-account-validator.dto';

export class UpdateBankAccountValidatorDto extends PartialType(
  CreateBankAccountValidatorDto,
) {}

