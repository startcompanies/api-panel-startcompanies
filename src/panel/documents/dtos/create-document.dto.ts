import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateDocumentDto {
  @IsNumber()
  @IsNotEmpty()
  requestId: number;

  @IsString()
  @IsNotEmpty()
  fieldName: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsIn(['certificate', 'document', 'form', 'other'])
  @IsNotEmpty()
  type: 'certificate' | 'document' | 'form' | 'other';

  @IsString()
  @IsNotEmpty()
  zohoWorkdriveFileId: string;

  @IsString()
  @IsNotEmpty()
  zohoWorkdriveUrl: string;

  @IsNumber()
  @IsNotEmpty()
  size: number;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

