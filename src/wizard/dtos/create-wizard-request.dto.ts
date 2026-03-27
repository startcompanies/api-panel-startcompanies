import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  Min,
  Max,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { RequestType } from '../../panel/requests/types/request-type';
import { CreateAperturaLlcRequestDto } from '../../panel/requests/dtos/create-apertura-llc-request.dto';
import { CreateRenovacionLlcRequestDto } from '../../panel/requests/dtos/create-renovacion-llc-request.dto';
import { CreateCuentaBancariaRequestDto } from '../../panel/requests/dtos/create-cuenta-bancaria-request.dto';

export class WizardClientDataDto {
  @ApiProperty({ example: 'Juan', description: 'Nombre del cliente' })
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @ApiProperty({ example: 'Pérez', description: 'Apellido del cliente' })
  @IsString()
  @IsNotEmpty()
  lastName: string;

  @ApiProperty({ example: 'juan@example.com', description: 'Email del cliente' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiPropertyOptional({ example: '+1234567890', description: 'Teléfono del cliente' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Contraseña del usuario' })
  @IsString()
  @IsNotEmpty()
  password: string;
}

export class CreateWizardRequestDto {
  @ApiPropertyOptional({
    enum: ['wizard', 'crm-lead', 'panel'],
    description: 'Canal de origen del flujo',
    example: 'wizard',
  })
  @IsOptional()
  @IsString()
  @IsIn(['wizard', 'crm-lead', 'panel'])
  source?: 'wizard' | 'crm-lead' | 'panel';

  @ApiProperty({
    enum: ['apertura-llc', 'renovacion-llc', 'cuenta-bancaria'],
    description: 'Tipo de solicitud',
    example: 'apertura-llc',
  })
  @IsIn(['apertura-llc', 'renovacion-llc', 'cuenta-bancaria'])
  type: RequestType;

  @ApiProperty({
    description: 'Número del paso actual en el wizard (1-7)',
    example: 1,
    minimum: 1,
    maximum: 7,
  })
  @IsNumber()
  @Min(1)
  @Max(7)
  currentStepNumber: number;

  @ApiPropertyOptional({
    description: 'Paso principal del wizard (1, 2, 3, 4)',
    example: 1,
    minimum: 1,
    maximum: 4,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  currentStep?: number;

  @ApiPropertyOptional({
    enum: ['solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'],
    description: 'Estado de la solicitud',
    example: 'pendiente',
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
    example: 'Solicitud desde wizard',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  // Información de pago (requerido en wizard)
  @ApiProperty({
    description: 'Token de Stripe generado en el frontend para procesar el pago',
    example: 'tok_visa_4242',
  })
  @IsString()
  @IsNotEmpty()
  stripeToken: string;

  @ApiProperty({
    description: 'Monto del pago en USD (puede ser 0 para cuenta gratuita)',
    example: 99.0,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  paymentAmount: number;

  @ApiProperty({
    enum: ['transferencia', 'stripe'],
    description: 'Método de pago seleccionado',
    example: 'stripe',
  })
  @IsString()
  @IsIn(['transferencia', 'stripe'])
  paymentMethod: 'transferencia' | 'stripe';

  @ApiPropertyOptional({
    description: 'URL del comprobante de transferencia bancaria',
    example: 'https://example.com/comprobante.pdf',
  })
  @IsOptional()
  @IsString()
  paymentProofUrl?: string;

  // Datos del cliente (requerido en wizard, debe incluir password)
  @ApiProperty({
    description: 'Datos del cliente para crear usuario y cliente',
    example: {
      firstName: 'Juan',
      lastName: 'Pérez',
      email: 'juan@example.com',
      phone: '+1234567890',
      password: 'SecurePassword123!',
    },
  })
  @IsNotEmpty()
  @ValidateNested()
  @Type(() => WizardClientDataDto)
  clientData: WizardClientDataDto;
}
