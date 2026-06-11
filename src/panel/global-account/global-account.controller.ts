import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { RolesGuard } from '../../shared/auth/roles.guard';
import { Roles } from '../../shared/auth/roles.decorator';
import { GlobalAccountService } from './global-account.service';
import { BridgeWebhookVerifyService } from './bridge-webhook-verify.service';
import type { BridgeAccountType } from './entities/bridge-account.entity';

class StartOnboardingDto {
  accountType!: BridgeAccountType;
}

@ApiTags('Panel - Cuenta global')
@Controller('panel/global-account')
@UseGuards(AuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class GlobalAccountController {
  constructor(private readonly globalAccountService: GlobalAccountService) {}

  @Get('status')
  @Roles('client')
  status(@Req() req: { user: { id: number } }) {
    return this.globalAccountService.getStatus(req.user.id);
  }

  @Post('onboarding/start')
  @Roles('client')
  start(
    @Req() req: { user: { id: number } },
    @Body() body: StartOnboardingDto,
  ) {
    const accountType = body?.accountType;
    if (accountType !== 'business' && accountType !== 'individual') {
      throw new BadRequestException('accountType inválido');
    }
    return this.globalAccountService.startOnboarding(req.user.id, accountType);
  }

  @Post('onboarding/sync/:accountType')
  @Roles('client')
  sync(
    @Req() req: { user: { id: number } },
    @Param('accountType') accountType: string,
  ) {
    if (accountType !== 'business' && accountType !== 'individual') {
      throw new BadRequestException('accountType inválido');
    }
    return this.globalAccountService.syncAccount(req.user.id, accountType);
  }

  @Post('onboarding/cancel/:accountType')
  @Roles('client')
  cancel(
    @Req() req: { user: { id: number } },
    @Param('accountType') accountType: string,
  ) {
    if (accountType !== 'business' && accountType !== 'individual') {
      throw new BadRequestException('accountType inválido');
    }
    return this.globalAccountService.cancelOnboarding(req.user.id, accountType);
  }
}

@ApiTags('Webhooks - Bridge')
@Controller('webhooks')
export class BridgeWebhookController {
  constructor(
    private readonly globalAccountService: GlobalAccountService,
    private readonly webhookVerify: BridgeWebhookVerifyService,
  ) {}

  @Post('bridge')
  @HttpCode(200)
  async bridgeWebhook(
    @Headers('x-webhook-signature') webhookSignature: string | undefined,
    @Headers('bridge-signature') legacySignature: string | undefined,
    @Req() req: { body: Buffer },
  ) {
    if (!Buffer.isBuffer(req.body)) {
      throw new UnauthorizedException('Webhook Bridge requiere body crudo');
    }
    if (
      !this.webhookVerify.verifyAny(req.body, {
        webhookSignature,
        legacySignature,
      })
    ) {
      throw new UnauthorizedException('Firma Bridge inválida');
    }

    await this.globalAccountService.handleWebhook(req.body);
    return { ok: true };
  }
}
