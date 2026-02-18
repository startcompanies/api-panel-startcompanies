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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAperturaLlcRequestDto } from './create-apertura-llc-request.dto';
import { CreateRenovacionLlcRequestDto } from './create-renovacion-llc-request.dto';
import { CreateCuentaBancariaRequestDto } from './create-cuenta-bancaria-request.dto';

export class UpdateRequestDto {
  @ApiPropertyOptional({
    enum: ['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'],
    description: 'Estado de la solicitud',
    example: 'en-proceso',
  })
  @IsOptional()
  @IsIn(['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'])
  status?: 'solicitud-recibida' | 'pendiente' | 'en-proceso' | 'completada' | 'rechazada';

  @ApiPropertyOptional({
    description: 'Etapa actual del blueprint de Zoho CRM',
    example: 'Etapa Inicial',
  })
  @IsOptional()
  @IsString()
  stage?: string; // Etapa actual del blueprint

  @ApiPropertyOptional({
    description: 'Número del paso actual en el wizard (1-7)',
    example: 5,
    minimum: 1,
    maximum: 7,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber?: number;

  @ApiPropertyOptional({
    description: 'Paso principal del wizard (1, 2, 3, 4)',
    example: 3,
    minimum: 1,
    maximum: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  currentStep?: number; // Paso principal del wizard (1, 2, 3, 4)

  @ApiPropertyOptional({
    description: 'Plan del servicio (ej. Entrepreneur, Elite, Premium). Se usa para validaciones al recargar.',
    example: 'Elite',
  })
  @IsOptional()
  @IsString()
  plan?: string;

  // Datos específicos según el tipo de solicitud (parciales)
  @ApiPropertyOptional({
    type: CreateAperturaLlcRequestDto,
    description: 'Datos específicos para solicitud de apertura LLC (parciales)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateAperturaLlcRequestDto)
  aperturaLlcData?: Partial<CreateAperturaLlcRequestDto>;

  @ApiPropertyOptional({
    type: CreateRenovacionLlcRequestDto,
    description: 'Datos específicos para solicitud de renovación LLC (parciales)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateRenovacionLlcRequestDto)
  renovacionLlcData?: Partial<CreateRenovacionLlcRequestDto>;

  @ApiPropertyOptional({
    type: CreateCuentaBancariaRequestDto,
    description: 'Datos específicos para solicitud de cuenta bancaria (parciales)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCuentaBancariaRequestDto)
  cuentaBancariaData?: Partial<CreateCuentaBancariaRequestDto>;

  @ApiPropertyOptional({
    description: 'Notas adicionales sobre la solicitud',
    example: 'Actualización de información',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Información de pago (para procesar pago al actualizar)
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

  @ApiPropertyOptional({
    description: 'URL de la firma del cliente en el paso de revisión final',
    example: 'https://example.com/signature.png',
  })
  @IsOptional()
  @IsString()
  signatureUrl?: string; // URL de la firma del cliente
}

