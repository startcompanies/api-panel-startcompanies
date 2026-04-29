import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../../shared/auth/auth.guard';
import { BillingService } from './billing.service';

@ApiTags('Panel - Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('access')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Estado de acceso por trial/suscripción' })
  async getAccess(
    @Req() req: { user?: { id?: number } },
  ) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.billingService.getAccessSnapshot(Number(userId));
  }

  @Post('subscription/checkout-session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear sesión de checkout Stripe para suscripción mensual' })
  async createCheckoutSession(@Req() req: { user?: { id?: number } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.billingService.createCheckoutSession(Number(userId));
  }

  @Post('subscription/portal-session')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Crear sesión de Stripe Customer Portal para administrar suscripción' })
  async createPortalSession(@Req() req: { user?: { id?: number } }) {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();
    return this.billingService.createCustomerPortalSession(Number(userId));
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

