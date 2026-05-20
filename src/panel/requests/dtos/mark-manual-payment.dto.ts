import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class MarkManualPaymentDto {
  @ApiProperty({
    description: 'Cómo se registró el pago fuera del formulario',
    enum: ['transferencia', 'efectivo', 'zelle', 'paypal', 'otro'],
    example: 'transferencia',
  })
  @IsIn(['transferencia', 'efectivo', 'zelle', 'paypal', 'otro'])
  paymentChannel: 'transferencia' | 'efectivo' | 'zelle' | 'paypal' | 'otro';

  @ApiPropertyOptional({ description: 'Detalle del registro (referencia, banco, etc.)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  paymentNotes?: string;

  @ApiPropertyOptional({ description: 'URL del comprobante subido' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  paymentProofUrl?: string;
}
