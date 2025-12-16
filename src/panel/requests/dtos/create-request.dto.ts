import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { RequestType } from '../types/request-type';
import { CreateAperturaLlcRequestDto } from './create-apertura-llc-request.dto';
import { CreateRenovacionLlcRequestDto } from './create-renovacion-llc-request.dto';
import { CreateCuentaBancariaRequestDto } from './create-cuenta-bancaria-request.dto';

export class CreateRequestDto {
  @IsIn(['apertura-llc', 'renovacion-llc', 'cuenta-bancaria'])
  type: RequestType;

  @IsNumber()
  clientId: number;

  @IsOptional()
  @IsNumber()
  partnerId?: number;

  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber: number;

  // Datos específicos según el tipo de solicitud
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAperturaLlcRequestDto)
  aperturaLlcData?: CreateAperturaLlcRequestDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRenovacionLlcRequestDto)
  renovacionLlcData?: CreateRenovacionLlcRequestDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCuentaBancariaRequestDto)
  cuentaBancariaData?: CreateCuentaBancariaRequestDto;

  @IsOptional()
  @IsString()
  notes?: string;
}

