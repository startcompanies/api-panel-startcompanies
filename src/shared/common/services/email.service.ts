import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

/** Colores y assets de marca (alineados con portal-startcompanies) */
const BRAND = {
  logoWhite: 'https://media.startcompanies.us/logo-sc.webp',
  logoDark: 'https://media.startcompanies.us/logo-sc-grey.webp',
  primary: '#0068BD',
  secondary: '#006AFE',
  dark: '#001627',
  text: '#283A48',
  bgLight: '#FDFFFE',
  bgMuted: '#f8f9fa',
} as const;

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
   * Genera el HTML de un correo con marca Start Companies (logos y colores del portal).
   */
  private getEmailHtml(params: {
    title: string;
    bodyHtml: string;
    button?: { text: string; url: string };
    codeBlock?: string;
  }): string {
    const { title, bodyHtml, button, codeBlock } = params;
    const year = new Date().getFullYear();
    const buttonHtml = button
      ? `<div style="text-align: center; margin: 24px 0;">
          <a href="${button.url}" style="display: inline-block; padding: 14px 32px; background: ${BRAND.secondary}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">${button.text}</a>
        </div>`
      : '';
    const codeHtml = codeBlock
      ? `<div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; padding: 14px 28px; background: ${BRAND.bgMuted}; border: 2px solid ${BRAND.secondary}; border-radius: 8px; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: ${BRAND.text};">${codeBlock}</span>
        </div>`
      : '';
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: ${BRAND.text}; background: ${BRAND.bgMuted}; }
    .wrap { max-width: 600px; margin: 0 auto; padding: 24px; }
    .card { background: ${BRAND.bgLight}; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,22,39,0.08); }
    .header { background: linear-gradient(180deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%); padding: 28px 24px; text-align: center; }
    .header img { height: 40px; width: auto; display: block; margin: 0 auto; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 600; }
    .content { padding: 32px 28px; }
    .content p { margin: 0 0 16px; color: ${BRAND.text}; }
    .content a { color: ${BRAND.secondary}; }
    .footer { padding: 20px 28px; text-align: center; border-top: 1px solid #e5e7eb; background: ${BRAND.bgLight}; }
    .footer img { height: 28px; opacity: 0.85; }
    .footer p { margin: 12px 0 0; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <img src="${BRAND.logoWhite}" alt="Start Companies" width="160" height="40" />
        <h1>${title}</h1>
      </div>
      <div class="content">
        ${bodyHtml}
        ${buttonHtml}
        ${codeHtml}
      </div>
    </div>
    <div class="footer">
      <img src="${BRAND.logoDark}" alt="Start Companies" width="112" height="28" />
      <p>© ${year} Start Companies LLC. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
`.trim();
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

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Has sido registrado como <strong>${userTypeLabel}</strong> en Start Companies.</p>
      <p>Para completar tu registro, necesitas establecer una contraseña. Haz clic en el botón para continuar:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 24 horas por seguridad.</p>
      <p>Si no solicitaste esta cuenta, puedes ignorar este email.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: `Bienvenido a Start Companies - Establece tu contraseña`,
        html: this.getEmailHtml({
          title: 'Bienvenido a Start Companies',
          bodyHtml,
          button: { text: 'Establecer Contraseña', url: resetUrl },
        }),
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

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para continuar:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 1 hora por seguridad.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este email y tu contraseña permanecerá igual.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Restablecer tu contraseña - Start Companies',
        html: this.getEmailHtml({
          title: 'Restablecer Contraseña',
          bodyHtml,
          button: { text: 'Restablecer Contraseña', url: resetUrl },
        }),
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

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Gracias por registrarte en Start Companies. Para continuar, necesitas confirmar tu dirección de email.</p>
      <p>Haz clic en el botón para confirmar tu email:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 24 horas por seguridad.</p>
      <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Confirma tu email - Start Companies',
        html: this.getEmailHtml({
          title: 'Confirma tu Email',
          bodyHtml,
          button: { text: 'Confirmar Email', url: confirmUrl },
        }),
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

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Gracias por registrarte en Start Companies. Para continuar, necesitas validar tu dirección de email.</p>
      <p>Copia el siguiente código e ingrésalo en tu proceso de registro para validar tu email:</p>
      <p>Si no creaste esta cuenta, puedes ignorar este email.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM_EMAIL') || 'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Valida tu email - Start Companies',
        html: this.getEmailHtml({
          title: 'Valida tu Email',
          bodyHtml,
          codeBlock: confirmationToken,
        }),
      });

      this.logger.log(`Email de validacion enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de validacion a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía un email confirmando que la solicitud del wizard fue enviada.
   * Se dispara al pasar el request a status = 'solicitud-recibida'.
   */
  async sendWizardRequestSubmittedEmail(params: {
    email: string;
    name: string;
    requestId: number;
    requestType: string;
  }): Promise<void> {
    const { email, name, requestId, requestType } = params;

    if (!this.resend) {
      this.logger.warn(`Email de solicitud enviada no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const panelUrl = `${frontendUrl}/panel`;

    const typeLabel =
      requestType === 'apertura-llc'
        ? 'Apertura de LLC'
        : requestType === 'renovacion-llc'
          ? 'Renovación de LLC'
          : requestType === 'cuenta-bancaria'
            ? 'Cuenta Bancaria'
            : 'Solicitud';

    const bodyHtml = `
      <p>Hola ${name || email},</p>
      <p>Tu solicitud de <strong>${typeLabel}</strong> ha sido enviada exitosamente.</p>
      <p><strong>ID de solicitud: #${requestId}</strong></p>
      <p>En breve nuestro equipo revisará tu información y se pondrá en contacto contigo.</p>
      <p>Si no solicitaste esto, por favor contáctanos.</p>
    `;

    await this.resend.emails.send({
      from:
        this.configService.get<string>('RESEND_FROM_EMAIL') ||
        'Start Companies <noreply@startcompanies.us>',
      to: email,
      subject: `Hemos recibido tu solicitud - ${typeLabel}`,
      html: this.getEmailHtml({
        title: 'Solicitud enviada',
        bodyHtml,
        button: { text: 'Ir a mi panel', url: panelUrl },
      }),
    });

    this.logger.log(`Email de solicitud enviada enviado a ${email} (request #${requestId})`);
  }
}









