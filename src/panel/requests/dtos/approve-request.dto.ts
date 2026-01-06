import { IsString, IsOptional, IsIn } from 'class-validator';

export class ApproveRequestDto {
  @IsOptional()
  @IsString()
  notes?: string;

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


