import { Controller, Post, Get, Body, UseGuards, Patch } from '@nestjs/common';
import { TagsService } from './tags.service';
import { TagDto } from './dtos/tag.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger';

@Controller('tags')
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get()
  findAll() {
    return this.tagsService.findAll();
  }

  @Post()
  @UseGuards(AuthGuard) // Este endpoint requiere un token JWT válido
  @ApiBearerAuth('JWT-auth')
  create(@Body() tagDto: TagDto) {
    console.log(tagDto);
    return this.tagsService.create(tagDto);
  }

  @Patch()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  update(@Body() tagDto: TagDto){}
}