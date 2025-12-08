import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateSandboxStatusDto {
  @ApiProperty({
    example: true,
    description: 'Indica si el post está en modo de revisión o no.',
  })
  @IsBoolean()
  sandbox: boolean;
}