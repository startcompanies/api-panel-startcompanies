import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ReusableElementsService } from './reusable-elements.service';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ReusableElementDto } from './dtos/reusable-element.dto';

@ApiTags('Blog - Reusable Elements')
@Controller('blog/reusable-elements')
export class ReusableElementsController {
  constructor(
    private readonly reusableElementsService: ReusableElementsService,
  ) {}

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener todos los elementos reutilizables' })
  findAll() {
    return this.reusableElementsService.findAll();
  }

  @Get(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener un elemento reutilizable por ID' })
  findById(@Param('id') id: string) {
    return this.reusableElementsService.findById(id);
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear un nuevo elemento reutilizable' })
  create(@Body() reusableElementDto: ReusableElementDto) {
    return this.reusableElementsService.create(reusableElementDto);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar un elemento reutilizable por ID' })
  update(
    @Param('id') id: string,
    @Body() reusableElementDto: ReusableElementDto,
  ) {
    return this.reusableElementsService.updateReusableElementById(
      id,
      reusableElementDto,
    );
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Eliminar un elemento reutilizable por ID' })
  delete(@Param('id') id: string) {
    return this.reusableElementsService.deleteById(id);
  }
}

