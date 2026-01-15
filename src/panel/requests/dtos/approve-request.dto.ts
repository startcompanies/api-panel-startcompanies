import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveRequestDto {
  @ApiPropertyOptional({
    description: 'Notas sobre la aprobación de la solicitud',
    example: 'Solicitud aprobada, iniciar proceso de filing',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Etapa inicial del blueprint después de aprobar la solicitud',
    enum: [
      'Apertura Confirmada',
      'Filing Iniciado',
      'EIN Solicitado',
      'Operating Agreement',
      'BOI Enviado',
      'Cuenta Bancaria Confirmada',
      'Confirmación pago',
      'Apertura Activa',
      'Apertura Perdida',
      'Apertura Cuenta Bancaria',
      'Onboarding',
      'Cuenta Bancaria Finalizada',
      'Cuenta Bancaria Perdida',
    ],
    example: 'Apertura Confirmada',
  })
  @IsOptional()
  @IsString()
  @IsIn([
    // Etapas de Apertura LLC
    'Apertura Confirmada',
    'Filing Iniciado',
    'EIN Solicitado',
    'Operating Agreement',
    'BOI Enviado',
    'Cuenta Bancaria Confirmada',
    'Confirmación pago',
    'Apertura Activa',
    'Apertura Perdida',
    'Apertura Cuenta Bancaria',
    // Etapas de Cuenta Bancaria
    'Cuenta Bancaria Confirmada',
    'Onboarding',
    'Cuenta Bancaria Finalizada',
    'Cuenta Bancaria Perdida',
  ])
  initialStage?: string; // Etapa inicial del blueprint después de aprobar
}


