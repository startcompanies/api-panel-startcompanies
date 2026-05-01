import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, MinLength } from 'class-validator';

export class PutUserAiCredentialsDto {
  @ApiProperty({ enum: ['anthropic', 'openai'] })
  @IsIn(['anthropic', 'openai'])
  provider: 'anthropic' | 'openai';

  @ApiProperty({ description: 'API key del proveedor (no se devuelve en GET)' })
  @IsString()
  @MinLength(8, { message: 'apiKey demasiado corta' })
  apiKey: string;
}
