import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private resend: Resend;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn('RESEND_API_KEY no configurada. Los emails no se enviarán.');
    }
  }

  /**
   * Envía un email de invitación para establecer contraseña
   */
  async sendInvitationEmail(
    email: string,
    name: string,
    resetToken: string,
    userType: 'partner' | 'client' | 'admin',
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de invitación no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const resetUrl = `${frontendUrl}/panel/set-password?token=${resetToken}`;

    const userTypeLabel = {
      partner: 'Partner',
      client: 'Cliente',
      admin: 'Administrador',
    }[userType];

    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: `Bienvenido a Start Companies - Establece tu contraseña`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Bienvenido a Start Companies</h1>
              </div>
              <div class="content">
                <p>Hola ${name},</p>
                <p>Has sido registrado como <strong>${userTypeLabel}</strong> en Start Companies.</p>
                <p>Para completar tu registro, necesitas establecer una contraseña. Haz clic en el siguiente botón para continuar:</p>
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Establecer Contraseña</a>
                </div>
                <p>O copia y pega este enlace en tu navegador:</p>
                <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
                <p><strong>Importante:</strong> Este enlace expirará en 24 horas por seguridad.</p>
                <p>Si no solicitaste esta cuenta, puedes ignorar este email.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Start Companies LLC. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Email de invitación enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de invitación a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía un email de recuperación de contraseña
   */
  async sendPasswordResetEmail(email: string, name: string, resetToken: string): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de reset no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const resetUrl = `${frontendUrl}/panel/reset-password?token=${resetToken}`;

    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Restablecer tu contraseña - Start Companies',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Restablecer Contraseña</h1>
              </div>
              <div class="content">
                <p>Hola ${name},</p>
                <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el siguiente botón para continuar:</p>
                <div style="text-align: center;">
                  <a href="${resetUrl}" class="button">Restablecer Contraseña</a>
                </div>
                <p>O copia y pega este enlace en tu navegador:</p>
                <p style="word-break: break-all; color: #0066cc;">${resetUrl}</p>
                <p><strong>Importante:</strong> Este enlace expirará en 1 hora por seguridad.</p>
                <p>Si no solicitaste este cambio, puedes ignorar este email y tu contraseña permanecerá igual.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Start Companies LLC. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Email de reset enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de reset a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía un email de confirmación de cuenta
   */
  async sendEmailConfirmation(
    email: string,
    name: string,
    confirmationToken: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de confirmación no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const confirmUrl = `${frontendUrl}/wizard/confirm-email?email=${encodeURIComponent(email)}&token=${confirmationToken}`;

    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Confirma tu email - Start Companies',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Confirma tu Email</h1>
              </div>
              <div class="content">
                <p>Hola ${name},</p>
                <p>Gracias por registrarte en Start Companies. Para continuar, necesitas confirmar tu dirección de email.</p>
                <p>Haz clic en el siguiente botón para confirmar tu email:</p>
                <div style="text-align: center;">
                  <a href="${confirmUrl}" class="button">Confirmar Email</a>
                </div>
                <p>O copia y pega este enlace en tu navegador:</p>
                <p style="word-break: break-all; color: #0066cc;">${confirmUrl}</p>
                <p><strong>Importante:</strong> Este enlace expirará en 24 horas por seguridad.</p>
                <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Start Companies LLC. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Email de confirmación enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de confirmación a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía un email con codigo para validar email
   */
  async sendCodeEmailValidation(
    email: string,
    name: string,
    confirmationToken: string,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de código de validación no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';

    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Valida tu email - Start Companies',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9f9f9; padding: 30px; border-radius: 0 0 5px 5px; }
              .button { display: inline-block; padding: 12px 30px; background-color: #0066cc; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
              .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Valida tu Email</h1>
              </div>
              <div class="content">
                <p>Hola ${name},</p>
                <p>Gracias por registrarte en Start Companies. Para continuar, necesitas validar tu dirección de email.</p>
                <p>Copia el siguiente código en ingresalo en tu proceso de registro para validar tu email:</p>
                <div style="text-align: center;">
                  <span class="button">${confirmationToken}</span>
                </div>
                <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
              </div>
              <div class="footer">
                <p>© ${new Date().getFullYear()} Start Companies LLC. Todos los derechos reservados.</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      this.logger.log(`Email de validacion enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de validacion a ${email}:`, error);
      throw error;
    }
  }
}









