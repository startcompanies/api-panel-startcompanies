import { PartialType } from '@nestjs/swagger';
import { CreateBankAccountValidatorDto } from './create-bank-account-validator.dto';

export class UpdateBankAccountValidatorDto extends PartialType(
  CreateBankAccountValidatorDto,
) {}

