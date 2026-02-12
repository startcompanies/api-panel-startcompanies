import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    // Obtener la clave secreta de Stripe desde las variables de entorno
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    
    if (!stripeSecretKey) {
      this.logger.warn('STRIPE_SECRET_KEY no está configurada. Los pagos con Stripe no funcionarán.');
      // En desarrollo, puedes usar una clave de prueba por defecto
      // this.stripe = new Stripe('sk_test_...', { apiVersion: '2024-12-18.acacia' });
    } else {
      this.stripe = new Stripe(stripeSecretKey, {
        apiVersion: '2026-01-28.clover',
      });
    }
  }

  /**
   * Crea un cargo (charge) usando un token de Stripe
   * @param token Token de Stripe generado en el frontend
   * @param amount Monto en centavos (ej: 1000 = $10.00)
   * @param currency Moneda (default: 'usd')
   * @param description Descripción del pago
   * @returns Resultado del cargo
   */
  async createCharge(
    token: string,
    amount: number,
    currency: string = 'usd',
    description?: string,
  ): Promise<Stripe.Charge> {
    if (!this.stripe) {
      throw new HttpException(
        'Stripe no está configurado. Por favor, configura STRIPE_SECRET_KEY en las variables de entorno.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      this.logger.log(`Creando cargo de ${amount} ${currency} con token ${token.substring(0, 10)}...`);

      const charge = await this.stripe.charges.create({
        amount: Math.round(amount * 100), // Convertir a centavos
        currency: currency.toLowerCase(),
        source: token, // Token de Stripe
        description: description || 'Pago de solicitud',
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.log(`Cargo creado exitosamente: ${charge.id}`);
      return charge;
    } catch (error: any) {
      this.logger.error(`Error al crear cargo: ${error.message}`, error.stack);
      
      // Manejar errores específicos de Stripe
      if (error.type === 'StripeCardError') {
        throw new HttpException(
          `Error de tarjeta: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      } else if (error.type === 'StripeRateLimitError') {
        throw new HttpException(
          'Demasiadas solicitudes. Por favor, intenta más tarde.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      } else if (error.type === 'StripeInvalidRequestError') {
        throw new HttpException(
          `Solicitud inválida: ${error.message}`,
          HttpStatus.BAD_REQUEST,
        );
      } else {
        throw new HttpException(
          `Error al procesar el pago: ${error.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  /**
   * Crea un PaymentIntent (método recomendado para pagos)
   * @param amount Monto en dólares (ej: 10.00)
   * @param currency Moneda (default: 'usd')
   * @param metadata Metadatos adicionales
   * @returns PaymentIntent con clientSecret
   */
  async createPaymentIntent(
    amount: number,
    currency: string = 'usd',
    metadata?: Record<string, string>,
  ): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new HttpException(
        'Stripe no está configurado. Por favor, configura STRIPE_SECRET_KEY en las variables de entorno.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      this.logger.log(`Creando PaymentIntent de ${amount} ${currency}`);

      const paymentIntent = await this.stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convertir a centavos
        currency: currency.toLowerCase(),
        metadata: metadata || {},
      });

      this.logger.log(`PaymentIntent creado: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error: any) {
      this.logger.error(`Error al crear PaymentIntent: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al crear PaymentIntent: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Confirma un PaymentIntent con un token
   * @param paymentIntentId ID del PaymentIntent
   * @param paymentMethodId ID del método de pago (token convertido)
   * @returns PaymentIntent confirmado
   */
  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId: string,
  ): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new HttpException(
        'Stripe no está configurado.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      this.logger.log(`Confirmando PaymentIntent: ${paymentIntentId}`);

      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId, {
        payment_method: paymentMethodId,
      });

      this.logger.log(`PaymentIntent confirmado: ${paymentIntent.id}`);
      return paymentIntent;
    } catch (error: any) {
      this.logger.error(`Error al confirmar PaymentIntent: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al confirmar el pago: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Obtiene información de un cargo
   * @param chargeId ID del cargo
   * @returns Información del cargo
   */
  async getCharge(chargeId: string): Promise<Stripe.Charge> {
    if (!this.stripe) {
      throw new HttpException(
        'Stripe no está configurado.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      return await this.stripe.charges.retrieve(chargeId);
    } catch (error: any) {
      this.logger.error(`Error al obtener cargo: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al obtener información del pago: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  /**
   * Reembolsa un cargo
   * @param chargeId ID del cargo a reembolsar
   * @param amount Monto a reembolsar (opcional, si no se especifica se reembolsa el total)
   * @returns Reembolso creado
   */
  async refundCharge(
    chargeId: string,
    amount?: number,
  ): Promise<Stripe.Refund> {
    if (!this.stripe) {
      throw new HttpException(
        'Stripe no está configurado.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    try {
      this.logger.log(`Reembolsando cargo: ${chargeId}`);

      const refund = await this.stripe.refunds.create({
        charge: chargeId,
        amount: amount ? Math.round(amount * 100) : undefined, // Convertir a centavos si se especifica
      });

      this.logger.log(`Reembolso creado: ${refund.id}`);
      return refund;
    } catch (error: any) {
      this.logger.error(`Error al reembolsar: ${error.message}`, error.stack);
      throw new HttpException(
        `Error al procesar el reembolso: ${error.message}`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}


