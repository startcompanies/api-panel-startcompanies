import {
  IsOptional,
  IsString,
  IsIn,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateAperturaLlcRequestDto } from './create-apertura-llc-request.dto';
import { CreateRenovacionLlcRequestDto } from './create-renovacion-llc-request.dto';
import { CreateCuentaBancariaRequestDto } from './create-cuenta-bancaria-request.dto';

export class UpdateRequestDto {
  @IsOptional()
  @IsIn(['pendiente', 'en-proceso', 'completada', 'rechazada'])
  status?: 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber?: number;

  // Datos específicos según el tipo de solicitud (parciales)
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAperturaLlcRequestDto)
  aperturaLlcData?: Partial<CreateAperturaLlcRequestDto>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRenovacionLlcRequestDto)
  renovacionLlcData?: Partial<CreateRenovacionLlcRequestDto>;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCuentaBancariaRequestDto)
  cuentaBancariaData?: Partial<CreateCuentaBancariaRequestDto>;

  @IsOptional()
  @IsString()
  notes?: string;
}

