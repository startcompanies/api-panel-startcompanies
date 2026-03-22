import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateLiliApplicationDto } from './dtos/create-lili-application.dto';
import { TestLiliWebhookDto } from './dtos/test-lili-webhook.dto';
import { LiliService } from './lili.service';

@ApiTags('Lili')
@Controller('lili')
export class LiliController {
  constructor(private readonly liliService: LiliService) {}

  @Post('create-application')
  @ApiOperation({
    summary: 'Crear aplicación de Lili',
    description:
      'Recibe los datos del cliente, crea la aplicación en Lili y devuelve el token del embed.',
  })
  @ApiBody({ type: CreateLiliApplicationDto })
  @ApiResponse({ status: 201, description: 'Aplicación creada exitosamente' })
  createApplication(@Body() dto: CreateLiliApplicationDto) {
    return this.liliService.createApplication(dto);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Webhook de Lili',
    description:
      'Recibe eventos de Lili. Tolera payloads con event/data o action/campos top-level.',
  })
  handleWebhook(@Body() body: Record<string, unknown>) {
    return this.liliService.handleWebhook(body);
  }

  @Get('webhook/inspect')
  @ApiOperation({
    summary: 'Inspeccionar webhooks de Lili',
    description: 'Devuelve los últimos 20 eventos recibidos para debugging.',
  })
  inspectWebhookLog() {
    return this.liliService.inspectWebhookLog();
  }

  @Post('webhook/test')
  @ApiOperation({
    summary: 'Simular webhook de Lili',
    description: 'Genera un evento mock para probar el procesamiento local.',
  })
  @ApiBody({ type: TestLiliWebhookDto })
  simulateWebhook(@Body() dto: TestLiliWebhookDto) {
    return this.liliService.simulateWebhook(dto);
  }
}
