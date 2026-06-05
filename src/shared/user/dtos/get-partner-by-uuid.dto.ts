import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class GetPartnerByUuidDto {
  @ApiProperty({ description: 'UUID del partner (usuario type partner)' })
  @IsString()
  @IsNotEmpty()
  @IsUUID('4')
  uuid: string;
}
