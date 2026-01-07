import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDocumentDto {
  @ApiProperty({ example: 1, description: 'ID de la solicitud asociada' })
  @IsNumber()
  @IsNotEmpty()
  requestId: number;

  @ApiProperty({ example: 'identityDocument', description: 'Nombre del campo donde se almacena el documento' })
  @IsString()
  @IsNotEmpty()
  fieldName: string;

  @ApiProperty({ example: 'Passport.pdf', description: 'Nombre del archivo' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: ['certificate', 'document', 'form', 'other'], example: 'document', description: 'Tipo de documento' })
  @IsIn(['certificate', 'document', 'form', 'other'])
  @IsNotEmpty()
  type: 'certificate' | 'document' | 'form' | 'other';

  @ApiProperty({ example: '1234567890', description: 'ID del archivo en Zoho Workdrive' })
  @IsString()
  @IsNotEmpty()
  zohoWorkdriveFileId: string;

  @ApiProperty({ example: 'https://workdrive.zoho.com/file/1234567890', description: 'URL del archivo en Zoho Workdrive' })
  @IsString()
  @IsNotEmpty()
  zohoWorkdriveUrl: string;

  @ApiProperty({ example: 1024000, description: 'Tamaño del archivo en bytes' })
  @IsNumber()
  @IsNotEmpty()
  size: number;

  @ApiPropertyOptional({ example: 'application/pdf', description: 'Tipo MIME del archivo' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ example: 'Documento de identidad escaneado', description: 'Descripción del documento' })
  @IsOptional()
  @IsString()
  description?: string;
}

