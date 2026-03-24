import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { GeoService } from './geo.service';

@ApiTags('Wizard - Geo')
@Controller('wizard/geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('country')
  @ApiOperation({
    summary: 'Código de país por IP del cliente',
    description:
      'Proxy servidor → ipapi.co. Usa X-Forwarded-For / IP del socket cuando es pública; si no, la IP de salida del servidor.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        countryCode: { type: 'string', example: 'mx' },
        countryName: { type: 'string', example: 'Mexico' },
      },
      required: ['countryCode'],
    },
  })
  async getCountry(@Req() req: Request) {
    return this.geoService.resolveCountry(req);
  }
}
