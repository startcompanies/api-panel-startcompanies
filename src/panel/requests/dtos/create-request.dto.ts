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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RequestType } from '../types/request-type';
import { CreateAperturaLlcRequestDto } from './create-apertura-llc-request.dto';
import { CreateRenovacionLlcRequestDto } from './create-renovacion-llc-request.dto';
import { CreateCuentaBancariaRequestDto } from './create-cuenta-bancaria-request.dto';

export class CreateRequestDto {
  @ApiProperty({
    enum: ['apertura-llc', 'renovacion-llc', 'cuenta-bancaria'],
    description: 'Tipo de solicitud',
    example: 'apertura-llc',
  })
  @IsIn(['apertura-llc', 'renovacion-llc', 'cuenta-bancaria'])
  type: RequestType;

  @ApiProperty({
    description: 'ID del cliente asociado a la solicitud',
    example: 1,
  })
  @IsNumber()
  clientId: number;

  @ApiPropertyOptional({
    description: 'ID del partner asociado (se asigna automáticamente si el usuario es partner)',
    example: 2,
  })
  @IsOptional()
  @IsNumber()
  partnerId?: number;

  @ApiProperty({
    description: 'Número del paso actual en el wizard (1-7)',
    example: 4,
    minimum: 1,
    maximum: 7,
  })
  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber: number;

  @ApiPropertyOptional({
    description: 'Paso principal del wizard (1, 2, 3, 4)',
    example: 2,
    minimum: 1,
    maximum: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  currentStep?: number; // Paso principal del wizard (1, 2, 3, 4)

  @ApiPropertyOptional({
    enum: ['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'],
    description: 'Estado de la solicitud',
    example: 'solicitud-recibida',
  })
  @IsOptional()
  @IsString()
  @IsIn(['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'])
  status?: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  // Datos específicos según el tipo de solicitud
  @ApiPropertyOptional({
    type: CreateAperturaLlcRequestDto,
    description: 'Datos específicos para solicitud de apertura LLC',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAperturaLlcRequestDto)
  aperturaLlcData?: CreateAperturaLlcRequestDto;

  @ApiPropertyOptional({
    type: CreateRenovacionLlcRequestDto,
    description: 'Datos específicos para solicitud de renovación LLC',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRenovacionLlcRequestDto)
  renovacionLlcData?: CreateRenovacionLlcRequestDto;

  @ApiPropertyOptional({
    type: CreateCuentaBancariaRequestDto,
    description: 'Datos específicos para solicitud de cuenta bancaria',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCuentaBancariaRequestDto)
  cuentaBancariaData?: CreateCuentaBancariaRequestDto;

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre la solicitud',
    example: 'Cliente requiere atención prioritaria',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Información de pago
  @ApiPropertyOptional({
    description: 'Token de Stripe generado en el frontend para procesar el pago',
    example: 'tok_visa_4242',
  })
  @IsOptional()
  @IsString()
  stripeToken?: string; // Token de Stripe generado en el frontend

  @ApiPropertyOptional({
    description: 'Monto del pago en USD (puede ser 0 para cuenta gratuita)',
    example: 99.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number; // Monto del pago en USD (puede ser 0 para cuenta gratuita)

  @ApiPropertyOptional({
    enum: ['transferencia', 'stripe'],
    description: 'Método de pago seleccionado',
    example: 'stripe',
  })
  @IsOptional()
  @IsString()
  paymentMethod?: 'transferencia' | 'stripe'; // Método de pago seleccionado

  @ApiPropertyOptional({
    description: 'URL del comprobante de transferencia bancaria',
    example: 'https://example.com/comprobante.pdf',
  })
  @IsOptional()
  @IsString()
  paymentProofUrl?: string; // URL del comprobante de transferencia

  // Datos del cliente (para crear/obtener el cliente si no existe)
  @ApiPropertyOptional({
    description: 'Datos del cliente para crear/obtener si no existe',
    example: {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
      phone: '+1234567890',
    },
  })
  @IsOptional()
  clientData?: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
}

