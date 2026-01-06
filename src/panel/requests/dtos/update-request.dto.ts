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
  @IsIn(['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'])
  status?: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  @IsOptional()
  @IsString()
  stage?: string; // Etapa actual del blueprint

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  currentStep?: number; // Paso principal del wizard (1, 2, 3, 4)

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

  // Información de pago (para procesar pago al actualizar)
  @IsOptional()
  @IsString()
  stripeToken?: string; // Token de Stripe generado en el frontend

  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number; // Monto del pago en USD (puede ser 0 para cuenta gratuita)

  @IsOptional()
  @IsString()
  paymentMethod?: 'transferencia' | 'stripe'; // Método de pago seleccionado

  @IsOptional()
  @IsString()
  paymentProofUrl?: string; // URL del comprobante de transferencia
}

