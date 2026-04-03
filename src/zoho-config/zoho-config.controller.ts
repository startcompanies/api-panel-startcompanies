import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  ParseIntPipe,
  HttpException,
} from '@nestjs/common';
import { ZohoConfigService } from './zoho-config.service';
import { ApiTags, ApiOperation, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { ZohoConfigDto, UpdateZohoConfigDto } from './zoho-config.dto';
import type { Response } from 'express';
import { AuthGuard } from 'src/shared/auth/auth.guard';
import { RolesGuard } from 'src/shared/auth/roles.guard';
import { Roles } from 'src/shared/auth/roles.decorator';

@ApiTags('Zoho Config')
@Controller('orgTk')
export class ZohoConfigController {
  constructor(private readonly zohoConfigService: ZohoConfigService) {}

  @Get()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener todas las configuraciones (solo admin)' })
  findAll() {
    return this.zohoConfigService.listForAdmin();
  }

  @Get('search')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Buscar configuración por org y service (solo admin)' })
  @ApiQuery({ name: 'org', required: true })
  @ApiQuery({ name: 'service', required: true })
  findOne(@Query('org') org: string, @Query('service') service: string) {
    return this.zohoConfigService.getByOrgAndServiceForAdmin(org, service);
  }

  @Get('redirect')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener URL de autorización OAuth (solo admin)' })
  @ApiQuery({ name: 'org', required: true })
  @ApiQuery({ name: 'service', required: true })
  @ApiQuery({ name: 'region', required: true })
  @ApiQuery({ name: 'client_id', required: true })
  @ApiQuery({ name: 'client_secret', required: false })
  @ApiQuery({ name: 'scopes', required: true })
  async redirectToZoho(
    @Query('org') org: string,
    @Query('service') service: string,
    @Query('region') region: string,
    @Query('client_id') client_id: string,
    @Query('client_secret') client_secret: string | undefined,
    @Query('scopes') scopes: string,
    @Res() res: Response,
  ) {
    const authorizationUrl = await this.zohoConfigService.redirectToAuthorization(
      org,
      service,
      region,
      scopes,
      client_id,
      client_secret,
    );
    return res.status(200).send({ url: authorizationUrl });
  }

  @Get('callback')
  @ApiOperation({ summary: 'Callback de OAuth desde Zoho' })
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'state', required: true })
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    if (!code) {
      return res.status(400).send('Authorization code is missing');
    }

    try {
      const stateNumber = parseInt(state, 10);
      if (isNaN(stateNumber)) {
        return res.status(400).send('Invalid state parameter');
      }

      const response = await this.zohoConfigService.getAccessToken(code, stateNumber);

      const data = {
        status: 'success',
        message: 'Access token obtenido y almacenado correctamente',
      };

      // Retornar HTML que envía mensaje al window.opener (para cerrar popup)
      return res.status(200).send(`
        <html>
          <body>
            <script type="text/javascript">
              window.opener.postMessage(${JSON.stringify(data)}, '*');
              window.close();
            </script>
            <h1>Procesando...</h1>
            <p>Por favor espera, procesando la autenticación...</p>
          </body>
        </html>
      `);
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : 500;
      let message = 'Error al procesar la autenticación';
      if (error instanceof HttpException) {
        const r = error.getResponse();
        if (typeof r === 'string') {
          message = r;
        } else if (r && typeof r === 'object' && 'message' in r) {
          const m = (r as { message: unknown }).message;
          message = Array.isArray(m) ? m.join(', ') : String(m);
        } else {
          message = error.message;
        }
      }
      const postPayload = JSON.stringify({ status: 'error', message });
      const htmlMsg = String(message)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return res.status(status).send(`
        <html>
          <body>
            <script type="text/javascript">
              window.opener.postMessage(${postPayload}, '*');
              window.close();
            </script>
            <h1>Hubo un error al procesar la autenticación</h1>
            <p>${htmlMsg}</p>
          </body>
        </html>
      `);
    }
  }

  @Get(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Obtener configuración por ID (solo admin)' })
  findById(@Param('id', ParseIntPipe) id: number) {
    return this.zohoConfigService.getOneForAdmin(id);
  }

  @Post()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear nueva configuración (solo admin)' })
  create(@Body() zohoConfigDto: ZohoConfigDto) {
    return this.zohoConfigService.create(zohoConfigDto);
  }

  @Put(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Actualizar configuración (solo admin)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() updateZohoConfigDto: UpdateZohoConfigDto) {
    return this.zohoConfigService.update(id, updateZohoConfigDto);
  }

  @Delete(':id')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Eliminar configuración (solo admin)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.zohoConfigService.remove(id);
  }
}








