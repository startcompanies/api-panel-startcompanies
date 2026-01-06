import { IsString, IsOptional } from 'class-validator';

export class RejectRequestDto {
  @IsOptional()
  @IsString()
  notes?: string; // Razón del rechazo
}

