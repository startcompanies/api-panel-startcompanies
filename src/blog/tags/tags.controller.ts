import { Controller, Post, Get, Body, UseGuards, Patch, Delete, Param } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagDto } from './dtos/tag.dto';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Blog - Tags')
@Controller('blog/tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener todas las etiquetas',
  })
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Obtener una etiqueta por su ID',
  })
  findById(@Param('id') id: string) {
    return this.tagsService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Crear una nueva etiqueta',
  })
  create(@Body() tagDto: TagDto) {
    return this.tagsService.create(tagDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Actualizar una etiqueta por su ID',
  })
  update(@Param('id') id: string, @Body() tagDto: TagDto){
    this.tagsService.updateTagById(id, tagDto);
  }
}