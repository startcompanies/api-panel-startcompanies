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

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  currentStep?: number; // Paso principal del wizard (1, 2, 3, 4)

  @IsOptional()
  @IsString()
  @IsIn(['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'])
  status?: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

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

  // Información de pago
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

  // Datos del cliente (para crear/obtener el cliente si no existe)
  @IsOptional()
  clientData?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
}

