import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { BillingService } from './billing.service';
import {
  TeamContextService,
  type SessionUserPayload,
} from '../account-team/team-context.service';

@ApiTags('Panel - Billing')
@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly teamContext: TeamContextService,
  ) {}

  private ownerId(req: { user?: SessionUserPayload }): number {
    const u = req.user;
    if (!u?.id) throw new UnauthorizedException();
    return this.teamContext.getEffectiveOwnerId(u);
  }

  @Get('access')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Estado de acceso por trial/suscripción' })
  async getAccess(
    @Req() req: { user?: SessionUserPayload },
  ) {
    if (!req.user?.id) throw new UnauthorizedException();
    this.teamContext.requirePermission(req.user, 'subscriptionView');
    return this.billingService.getAccessSnapshot(this.ownerId(req));
  }

  @Post('subscription/checkout-session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear sesión de checkout Stripe para suscripción mensual' })
  async createCheckoutSession(@Req() req: { user?: SessionUserPayload }) {
    if (!req.user?.id) throw new UnauthorizedException();
    this.teamContext.requirePermission(req.user, 'subscriptionManage');
    return this.billingService.createCheckoutSession(this.ownerId(req));
  }

  @Post('subscription/portal-session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear sesión de Stripe Customer Portal para administrar suscripción' })
  async createPortalSession(@Req() req: { user?: SessionUserPayload }) {
    if (!req.user?.id) throw new UnauthorizedException();
    this.teamContext.requirePermission(req.user, 'subscriptionManage');
    return this.billingService.createCustomerPortalSession(this.ownerId(req));
  }

  @Post('users/:userId/platform-access')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Otorgar acceso a la plataforma a un usuario (solo admin)' })
  @ApiBody({ schema: { properties: { planCode: { type: 'string' } }, required: ['planCode'] } })
  async grantPlatformAccess(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { planCode: string },
    @Req() req: { user?: { id?: number; type?: string } },
  ) {
    if (req.user?.type !== 'admin') throw new ForbiddenException('Solo admins pueden ejecutar esta acción');
    await this.billingService.grantPlatformAccess(userId, body.planCode);
    return { ok: true };
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook Stripe para suscripciones' })
  async stripeWebhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() req: { body: Buffer },
    @Body() _unused: unknown,
  ) {
    return this.billingService.handleStripeWebhook(signature, req.body);
  }
}

