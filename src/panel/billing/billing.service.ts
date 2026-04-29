import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { StripeService } from '../../shared/payments/stripe.service';
import { User } from '../../shared/user/entities/user.entity';
import { StripeWebhookEvent } from './entities/stripe-webhook-event.entity';

type BillingAccessState =
  | 'trial_active'
  | 'trial_expired'
  | 'subscription_active'
  | 'subscription_past_due'
  | 'subscription_canceled'
  | 'no_subscription';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly trialMonthsExisting = Number(process.env.BILLING_TRIAL_MONTHS_EXISTING || '6');
  private readonly trialMonthsNew = Number(process.env.BILLING_TRIAL_MONTHS_NEW || '3');
  private readonly existingCutoff = new Date(process.env.BILLING_EXISTING_CUTOFF || '2026-04-29T00:00:00.000Z');
  private readonly monthlyPriceUsd = Number(process.env.BILLING_MONTHLY_PRICE_USD || '25');
  private readonly frontendBaseUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
  private readonly stripePriceId = process.env.STRIPE_SUBSCRIPTION_PRICE_ID || '';
  private readonly stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(StripeWebhookEvent)
    private readonly webhookEventsRepo: Repository<StripeWebhookEvent>,
    private readonly stripeService: StripeService,
  ) {}

  private get stripeClient(): Stripe {
    const client = this.stripeService.getClient();
    if (!client) {
      throw new BadRequestException('Stripe no está configurado en el servidor.');
    }
    return client;
  }

  private addMonths(date: Date, months: number): Date {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
  }

  private isExistingAccount(createdAt: Date): boolean {
    return createdAt.getTime() <= this.existingCutoff.getTime();
  }

  private deriveAccessState(user: User): BillingAccessState {
    if (user.type !== 'client') {
      // El trial comercial solo aplica a clientes finales.
      // Staff/admin/partners mantienen acceso al panel sin depender de suscripción.
      return 'subscription_active';
    }
    const s = (user.billingSubscriptionStatus || '').toLowerCase();
    if (s === 'active' || s === 'trialing') return 'subscription_active';
    if (s === 'past_due' || s === 'unpaid' || s === 'incomplete' || s === 'incomplete_expired') {
      return 'subscription_past_due';
    }
    if (s === 'canceled') return 'subscription_canceled';

    if (user.billingTrialEndAt) {
      return user.billingTrialEndAt.getTime() > Date.now() ? 'trial_active' : 'trial_expired';
    }
    return 'no_subscription';
  }

  async ensureTrialWindow(user: User): Promise<User> {
    if (user.type !== 'client') {
      user.billingAccessState = this.deriveAccessState(user);
      return this.usersRepo.save(user);
    }
    if (user.billingTrialStartAt && user.billingTrialEndAt) return user;
    const trialMonths = this.isExistingAccount(user.createdAt) ? this.trialMonthsExisting : this.trialMonthsNew;
    user.billingTrialStartAt = user.createdAt;
    user.billingTrialEndAt = this.addMonths(user.createdAt, trialMonths);
    user.billingMonthlyPriceUsd = Number(user.billingMonthlyPriceUsd || this.monthlyPriceUsd);
    user.billingAccessState = this.deriveAccessState(user);
    return this.usersRepo.save(user);
  }

  async getAccessSnapshot(userId: number) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('Usuario no encontrado');
    }
    const hydrated = await this.ensureTrialWindow(user);
    const accessState = this.deriveAccessState(hydrated);
    const trialEndAt =
      hydrated.type === 'client' && hydrated.billingTrialEndAt
        ? hydrated.billingTrialEndAt.toISOString()
        : null;
    const trialStartAt =
      hydrated.type === 'client' && hydrated.billingTrialStartAt
        ? hydrated.billingTrialStartAt.toISOString()
        : null;
    return {
      accessState,
      trialStartAt,
      trialEndAt,
      subscriptionStatus: hydrated.billingSubscriptionStatus ?? null,
      monthlyPriceUsd: Number(hydrated.billingMonthlyPriceUsd || this.monthlyPriceUsd),
    };
  }

  async createCheckoutSession(userId: number): Promise<{ url: string }> {
    if (!this.stripePriceId) {
      throw new BadRequestException('Falta STRIPE_SUBSCRIPTION_PRICE_ID');
    }
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    await this.ensureTrialWindow(user);

    const stripe = this.stripeClient;
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: [user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.username,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      user.stripeCustomerId = customerId;
      await this.usersRepo.save(user);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: this.stripePriceId, quantity: 1 }],
      success_url: `${this.frontendBaseUrl}/panel/subscription?checkout=success`,
      cancel_url: `${this.frontendBaseUrl}/panel/subscription?checkout=cancel`,
      metadata: { userId: String(user.id) },
      subscription_data: {
        metadata: { userId: String(user.id) },
      },
      allow_promotion_codes: true,
    });

    if (!session.url) {
      throw new BadRequestException('No se pudo generar la URL de Checkout');
    }
    return { url: session.url };
  }

  async createCustomerPortalSession(userId: number): Promise<{ url: string }> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new BadRequestException('Usuario no encontrado');
    if (!user.stripeCustomerId) {
      throw new BadRequestException('No existe cliente de Stripe para este usuario');
    }
    const stripe = this.stripeClient;
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${this.frontendBaseUrl}/panel/subscription`,
    });
    return { url: session.url };
  }

  private async updateUserFromSubscription(subscription: Stripe.Subscription, fallbackUserId?: number): Promise<void> {
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    let user: User | null = null;
    if (customerId) {
      user = await this.usersRepo.findOne({ where: { stripeCustomerId: customerId } });
    }
    if (!user && fallbackUserId) {
      user = await this.usersRepo.findOne({ where: { id: fallbackUserId } });
    }
    if (!user) return;

    user.stripeCustomerId = customerId || user.stripeCustomerId;
    user.billingSubscriptionId = subscription.id;
    user.billingSubscriptionStatus = subscription.status;
    const currentPeriodEndUnix = Number((subscription as any)?.current_period_end || 0);
    user.billingSubscriptionCurrentPeriodEnd = currentPeriodEndUnix > 0
      ? new Date(currentPeriodEndUnix * 1000)
      : null;
    user.billingSubscriptionCancelAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null;
    user.billingAccessState = this.deriveAccessState(user);
    await this.usersRepo.save(user);
  }

  async handleStripeWebhook(signature: string | undefined, payload: Buffer): Promise<{ received: true }> {
    if (!this.stripeWebhookSecret) throw new BadRequestException('Falta STRIPE_WEBHOOK_SECRET');
    const stripe = this.stripeClient;
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature || '', this.stripeWebhookSecret);
    } catch (err: any) {
      this.logger.warn(`Webhook de Stripe inválido: ${err?.message || err}`);
      throw new BadRequestException('Firma inválida de webhook');
    }

    const alreadyProcessed = await this.webhookEventsRepo.findOne({ where: { id: event.id } });
    if (alreadyProcessed) {
      return { received: true };
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = Number(session.metadata?.userId || 0) || undefined;
        const subscriptionId =
          typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          await this.updateUserFromSubscription(subscription, userId);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await this.updateUserFromSubscription(subscription);
        break;
      }
      default:
        break;
    }
    const processedEvent = this.webhookEventsRepo.create({ id: event.id, type: event.type });
    await this.webhookEventsRepo.save(processedEvent);
    return { received: true };
  }
}

