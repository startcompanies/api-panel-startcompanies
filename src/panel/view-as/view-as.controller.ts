import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { StartViewAsDto } from './dtos/start-view-as.dto';
import { ViewAsService } from './view-as.service';
import {
  VIEW_AS_ACTOR_ACCESS_COOKIE,
  VIEW_AS_ACCESS_MAX_AGE_MS,
} from './view-as.constants';

const isProduction = process.env.NODE_ENV === 'production';
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

@ApiTags('Panel - View as client')
@Controller('panel/view-as')
export class ViewAsController {
  constructor(private readonly viewAsService: ViewAsService) {}

  @Post('start')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('partner', 'admin', 'user')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Iniciar modo vista del panel del cliente',
    description:
      'Intercambia la cookie access_token por una sesión de solo lectura del cliente. Guarda el token del operador en cookie HttpOnly.',
  })
  async start(
    @Body() dto: StartViewAsDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const actorToken = req.cookies?.access_token;
    const result = await this.viewAsService.start(
      actorToken,
      req['user'],
      dto,
    );

    res.cookie(VIEW_AS_ACTOR_ACCESS_COOKIE, result.actorAccessTokenToStore, {
      ...cookieOptions,
      maxAge: VIEW_AS_ACCESS_MAX_AGE_MS,
    });
    res.cookie('access_token', result.accessToken, {
      ...cookieOptions,
      maxAge: VIEW_AS_ACCESS_MAX_AGE_MS,
    });

    return {
      ok: true,
      user: result.user,
      redirectTo: '/panel/client-dashboard',
    };
  }

  @Post('end')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Salir del modo vista',
    description: 'Restaura la cookie access_token del operador.',
  })
  async end(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.viewAsService.end(
      req.cookies?.access_token,
      req.cookies?.[VIEW_AS_ACTOR_ACCESS_COOKIE],
    );

    const clearOpts = { ...cookieOptions };
    res.clearCookie(VIEW_AS_ACTOR_ACCESS_COOKIE, clearOpts);
    res.cookie('access_token', result.accessToken, {
      ...cookieOptions,
      maxAge: 60 * 60 * 1000,
    });

    return { ok: true, user: result.user };
  }
}
