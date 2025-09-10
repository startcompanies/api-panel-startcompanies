import { Controller, Post, Get, Body, UseGuards, Patch, Delete, Param } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagDto } from './dtos/tag.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  findAll() {
    return this.tagsService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  findById(@Param('id') id: string) {
    return this.tagsService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  create(@Body() tagDto: TagDto) {
    return this.tagsService.create(tagDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  update(@Param('id') id: string, @Body() tagDto: TagDto){
    this.tagsService.updateTagById(id, tagDto);
  }
}