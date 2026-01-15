import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PostDto {
  @ApiProperty({
    example: 'Mi Primer Artículo sobre NestJS',
    description: 'El título del post.',
  })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Este es el contenido completo de mi primer artículo, donde explico los conceptos básicos de NestJS...',
    description: 'El contenido principal del post en formato de texto enriquecido.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;

  // Slug del post
  @ApiProperty({
    example: 'mi-primer-articulo-sobre-nestjs',
    description: 'El slug del post.',
    required: false,
  })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiProperty({
    example: 'https://ejemplo.com/imagen-de-portada.jpg',
    description: 'URL de la imagen destacada para el post.',
    required: false,
  })
  @IsString()
  @IsOptional()
  image_url?: string;

  @ApiProperty({
    example: true,
    description: 'Indica si el post está publicado o no.',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  is_published?: boolean;

  @ApiProperty({
    example: true,
    description: 'Indica si el post está en modo de revisión o no.',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  sandbox?: boolean;

  @ApiProperty({
    example: '2023-10-27T10:00:00Z',
    description: 'Fecha y hora de publicación del post. Si no se provee, se establece automáticamente al publicarse.',
    required: false,
  })
  @IsOptional()
  published_at?: Date;

  @ApiProperty({
    type: [Number],
    example: [1, 2, 3],
    description: 'Un array de IDs de las categorías a las que pertenece el post.',
    required: false,
  })
  @IsNumber({}, { each: true })
  @IsOptional()
  categories_ids?: number[];

  @ApiProperty({
    type: [Number],
    example: [10, 11],
    description: 'Un array de IDs de los tags asociados al post.',
    required: false,
  })
  @IsNumber({}, { each: true })
  @IsOptional()
  tags_ids?: number[];
}