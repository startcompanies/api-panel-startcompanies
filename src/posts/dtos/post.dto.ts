import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class PostDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  excerpt: string;

  @IsString()
  @IsOptional()
  image_url?: string;

  @IsOptional()
  published_at?: Date; // No es necesario el decorador de fecha si la entidad lo maneja

  @IsNumber({}, { each: true })
  @IsOptional()
  categories_ids?: number[];

  @IsNumber({}, { each: true })
  @IsOptional()
  tags_ids?: number[];
}
