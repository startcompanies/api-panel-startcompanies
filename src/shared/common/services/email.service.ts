import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailBranding } from '../types/email-branding.types';

/** Colores y assets de marca (alineados con portal-startcompanies) */
const BRAND = {
  logoWhite: 'https://media.startcompanies.us/logo.png',
  logoDark: 'https://media.startcompanies.us/logo-dark.png',
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

  private platformDisplayName(): string {
    return (
      this.configService.get<string>('PLATFORM_DISPLAY_NAME')?.trim() ||
      'Start Companies'
    );
  }

  private mergeBranding(partial?: Partial<EmailBranding>): EmailBranding {
    const platformName = this.platformDisplayName();
    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:4200';
    return {
      brandDisplayName: partial?.brandDisplayName?.trim() || platformName,
      frontendBaseUrl: partial?.frontendBaseUrl?.replace(/\/$/, '') || frontendUrl,
      logoUrl: partial?.logoUrl ?? BRAND.logoWhite,
      logoDarkUrl: partial?.logoDarkUrl ?? BRAND.logoDark,
      primaryColor: partial?.primaryColor || BRAND.primary,
      secondaryColor: partial?.secondaryColor || BRAND.secondary,
    };
  }

  private formatResendFrom(branding: EmailBranding): string {
    const configuredFrom =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'Start Companies <noreply@startcompanies.us>';
    const platformName = this.platformDisplayName();
    if (branding.brandDisplayName === platformName) {
      return configuredFrom;
    }
    const verifiedEmail = this.extractFromEmailAddress(configuredFrom);
    return this.formatOnBehalfOfFrom(
      branding.brandDisplayName,
      platformName,
      verifiedEmail,
    );
  }

  /**
   * HTML de correo con colores y logos del tenant (o plataforma por defecto).
   */
  private getEmailHtml(params: {
    title: string;
    bodyHtml: string;
    button?: { text: string; url: string };
    codeBlock?: string;
    branding?: Partial<EmailBranding>;
  }): string {
    const { title, bodyHtml, button, codeBlock } = params;
    const b = this.mergeBranding(params.branding);
    const year = new Date().getFullYear();
    const headerLogo = this.escapeHtmlAttr(b.logoUrl || BRAND.logoWhite);
    const brandAlt = this.escapeHtmlAttr(b.brandDisplayName);
    const buttonHtml = button
      ? `<div style="text-align: center; margin: 24px 0;">
          <a href="${button.url}" style="display: inline-block; padding: 14px 32px; background: ${b.secondaryColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">${button.text}</a>
        </div>`
      : '';
    const codeHtml = codeBlock
      ? `<div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; padding: 14px 28px; background: ${BRAND.bgMuted}; border: 2px solid ${b.secondaryColor}; border-radius: 8px; font-size: 20px; font-weight: 700; letter-spacing: 4px; color: ${BRAND.text};">${codeBlock}</span>
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
    .header { background: linear-gradient(180deg, ${b.primaryColor} 0%, ${b.secondaryColor} 100%); padding: 28px 24px; text-align: center; }
    .header img { height: 40px; width: auto; display: block; margin: 0 auto; }
    .header h1 { margin: 0; color: #ffffff; font-size: 22px; font-weight: 600; }
    .content { padding: 32px 28px; }
    .content p { margin: 0 0 16px; color: ${BRAND.text}; }
    .content a { color: ${b.secondaryColor}; }
    .footer { padding: 16px 28px; text-align: center; border-top: 1px solid #e5e7eb; background: ${BRAND.bgLight}; }
    .footer p { margin: 0; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <img src="${headerLogo}" alt="${brandAlt}" width="160" height="40" />
        <h1>${title}</h1>
      </div>
      <div class="content">
        ${bodyHtml}
        ${buttonHtml}
        ${codeHtml}
      </div>
    </div>
    <div class="footer">
      <p>© ${year} ${brandAlt}. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
`.trim();
  }

  private escapeHtmlAttr(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /** Extrae solo la dirección de `RESEND_FROM_EMAIL` (ej. `Nombre <a@b.com>` → `a@b.com`). */
  private extractFromEmailAddress(configuredFrom: string): string {
    const s = configuredFrom.trim();
    const m = s.match(/<([^>]+)>\s*$/);
    if (m) return m[1].trim();
    return s;
  }

  /** `Display Name <email>` para Resend; mismo buzón que siempre, solo cambia el nombre visible. */
  private formatFromDisplayNameAndEmail(displayName: string, email: string): string {
    let n = displayName.replace(/[\r\n]/g, ' ').trim() || 'Start Companies';
    n = n.slice(0, 120);
    const needsQuote = /[,;<>()[\]"]|\\/.test(n);
    const local = needsQuote ? `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : n;
    return `${local} <${email.trim()}>`;
  }

  /**
   * Patrón "On Behalf Of" para proveedores como Resend:
   * - From usa dominio verificado (plataforma)
   * - Reply-To apunta al correo real del emisor (usuario/empresa)
   * Si no hay nombre legal de emisor, solo se muestra la plataforma (sin inventar otra razón social).
   */
  private formatOnBehalfOfFrom(issuerName: string, platformName: string, verifiedFromEmail: string): string {
    const t = issuerName.replace(/[\r\n]/g, ' ').trim();
    if (!t) {
      return this.formatFromDisplayNameAndEmail(platformName, verifiedFromEmail);
    }
    const display = `${t} via ${platformName}`.slice(0, 140);
    return this.formatFromDisplayNameAndEmail(display, verifiedFromEmail);
  }

  /** URL de logo solo http(s) para `<img src>`. */
  private safeIssuerLogoUrl(url: string | null | undefined): string | null {
    if (!url?.trim()) return null;
    const u = url.trim();
    if (!/^https:\/\//i.test(u) && !/^http:\/\//i.test(u)) return null;
    return this.escapeHtmlAttr(u);
  }

  /** Plantilla de correo de factura: marca del emisor (nombre + logo del perfil). */
  private getInvoiceEmailHtml(params: {
    title: string;
    bodyHtml: string;
    issuerName: string;
    issuerLogoUrl: string | null;
  }): string {
    const { title, bodyHtml, issuerName, issuerLogoUrl } = params;
    const year = new Date().getFullYear();
    const safeNameText = issuerName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeTitleText = title
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const logo = this.safeIssuerLogoUrl(issuerLogoUrl);
    const logoAlt = this.escapeHtmlAttr(issuerName);

    const headerInner = logo
      ? `<div class="header" style="background: #f1f5f9; padding: 28px 24px; text-align: center; border-bottom: 1px solid #e2e8f0;">
          <img src="${logo}" alt="${logoAlt}" width="160" height="48" style="max-height: 48px; width: auto; height: auto; display: block; margin: 0 auto 16px; object-fit: contain;" />
          <p style="margin: 0 0 4px; color: ${BRAND.text}; font-size: 15px; font-weight: 600;">${safeNameText}</p>
          <h1 style="margin: 0; color: ${BRAND.dark}; font-size: 20px; font-weight: 600;">${safeTitleText}</h1>
        </div>`
      : `<div class="header" style="background: linear-gradient(180deg, ${BRAND.primary} 0%, ${BRAND.secondary} 100%); padding: 28px 24px; text-align: center;">
          <p style="margin: 0 0 8px; color: rgba(255,255,255,0.95); font-size: 15px; font-weight: 600;">${safeNameText}</p>
          <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 600;">${safeTitleText}</h1>
        </div>`;

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
    .content { padding: 32px 28px; }
    .content p { margin: 0 0 16px; color: ${BRAND.text}; }
    .content a { color: ${BRAND.secondary}; }
    .footer { padding: 16px 28px; text-align: center; border-top: 1px solid #e5e7eb; background: ${BRAND.bgLight}; }
    .footer p { margin: 0; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      ${headerInner}
      <div class="content">
        ${bodyHtml}
      </div>
    </div>
    <div class="footer">
      <p>© ${year} ${safeNameText}</p>
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
    branding?: Partial<EmailBranding>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de invitación no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const resetUrl = `${b.frontendBaseUrl}/panel/set-password?token=${resetToken}`;

    const userTypeLabel = {
      partner: 'Partner',
      client: 'Cliente',
      admin: 'Administrador',
    }[userType];

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Has sido registrado como <strong>${userTypeLabel}</strong> en <strong>${b.brandDisplayName}</strong>.</p>
      <p>Para completar tu registro, necesitas establecer una contraseña. Haz clic en el botón para continuar:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 24 horas por seguridad.</p>
      <p>Si no solicitaste esta cuenta, puedes ignorar este email.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.formatResendFrom(b),
        to: email,
        subject: `Bienvenido a ${b.brandDisplayName} - Establece tu contraseña`,
        html: this.getEmailHtml({
          title: `Bienvenido a ${b.brandDisplayName}`,
          bodyHtml,
          button: { text: 'Establecer Contraseña', url: resetUrl },
          branding: b,
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
  async sendPasswordResetEmail(
    email: string,
    name: string,
    resetToken: string,
    branding?: Partial<EmailBranding>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de reset no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const resetUrl = `${b.frontendBaseUrl}/panel/reset-password?token=${resetToken}`;

    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Recibimos una solicitud para restablecer tu contraseña en <strong>${b.brandDisplayName}</strong>. Haz clic en el botón para continuar:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${resetUrl}">${resetUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 1 hora por seguridad.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este email y tu contraseña permanecerá igual.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.formatResendFrom(b),
        to: email,
        subject: `Restablecer tu contraseña - ${b.brandDisplayName}`,
        html: this.getEmailHtml({
          title: 'Restablecer Contraseña',
          bodyHtml,
          button: { text: 'Restablecer Contraseña', url: resetUrl },
          branding: b,
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
   * Código de un solo uso para el segundo factor del login al panel.
   */
  async sendPanelLoginOtpEmail(
    email: string,
    name: string,
    code: string,
    branding?: Partial<EmailBranding>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de login 2FA no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const bodyHtml = `
      <p>Hola ${name},</p>
      <p>Alguien está intentando iniciar sesión en el panel de <strong>${b.brandDisplayName}</strong> con tu cuenta.</p>
      <p>Introduce este código para completar el acceso. Caduca en pocos minutos.</p>
      <p>Si no fuiste tú, ignora este mensaje y tu contraseña sigue siendo necesaria para entrar.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.formatResendFrom(b),
        to: email,
        subject: `Código de acceso al panel - ${b.brandDisplayName}`,
        html: this.getEmailHtml({
          title: 'Verificación en dos pasos',
          bodyHtml,
          codeBlock: code,
          branding: b,
        }),
      });

      this.logger.log(`Email de login 2FA enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de login 2FA a ${email}:`, error);
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
    includeActivationCta?: boolean;
    branding?: Partial<EmailBranding>;
  }): Promise<void> {
    const {
      email,
      name,
      requestId,
      requestType,
      includeActivationCta = true,
      branding,
    } = params;

    if (!this.resend) {
      this.logger.warn(`Email de solicitud enviada no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const panelUrl = `${b.frontendBaseUrl}/panel`;
    const activateAccountUrl = `${b.frontendBaseUrl}/panel/login`;

    const typeLabel =
      requestType === 'apertura-llc'
        ? 'Apertura de LLC'
        : requestType === 'renovacion-llc'
          ? 'Renovación de LLC'
          : requestType === 'cuenta-bancaria'
            ? 'Cuenta Bancaria'
            : 'Solicitud';

    const activationLine = includeActivationCta
      ? '<p>Si aún no activas tu acceso, usa el botón para entrar y activar tu cuenta.</p>'
      : '';

    const bodyHtml = `
      <p>Hola ${name || email},</p>
      <p>Tu solicitud de <strong>${typeLabel}</strong> en <strong>${b.brandDisplayName}</strong> ha sido enviada exitosamente.</p>
      <p><strong>ID de solicitud: #${requestId}</strong></p>
      <p>En breve nuestro equipo revisará tu información y se pondrá en contacto contigo.</p>
      ${activationLine}
      <p>Si no solicitaste esto, por favor contáctanos.</p>
    `;

    await this.resend.emails.send({
      from: this.formatResendFrom(b),
      to: email,
      subject: `Hemos recibido tu solicitud - ${typeLabel} — ${b.brandDisplayName}`,
      html: this.getEmailHtml({
        title: includeActivationCta
          ? 'Solicitud enviada y activa tu cuenta'
          : 'Solicitud enviada',
        bodyHtml,
        button: includeActivationCta
          ? { text: 'Activar mi cuenta', url: activateAccountUrl || panelUrl }
          : undefined,
        branding: b,
      }),
    });

    this.logger.log(`Email de solicitud enviada enviado a ${email} (request #${requestId})`);
  }

  /**
   * Envía un email de verificación para confirmar el cambio de correo desde el panel.
   */
  async sendEmailChangeVerification(
    newEmail: string,
    name: string,
    token: string,
    branding?: Partial<EmailBranding>,
  ): Promise<void> {
    if (!this.resend) {
      this.logger.warn(`Email de cambio de correo no enviado a ${newEmail} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const confirmUrl = `${b.frontendBaseUrl}/panel/settings?confirmEmailToken=${encodeURIComponent(token)}`;

    const bodyHtml = `
      <p>Hola ${name || newEmail},</p>
      <p>Recibimos una solicitud para cambiar el correo electrónico de tu cuenta en <strong>${b.brandDisplayName}</strong> a <strong>${newEmail}</strong>.</p>
      <p>Haz clic en el botón para confirmar el cambio:</p>
      <p>O copia y pega este enlace en tu navegador:</p>
      <p style="word-break: break-all;"><a href="${confirmUrl}">${confirmUrl}</a></p>
      <p><strong>Importante:</strong> Este enlace expirará en 24 horas.</p>
      <p>Si no solicitaste este cambio, puedes ignorar este email y tu correo permanecerá igual.</p>
    `;
    try {
      await this.resend.emails.send({
        from: this.formatResendFrom(b),
        to: newEmail,
        subject: `Confirma tu nuevo correo - ${b.brandDisplayName}`,
        html: this.getEmailHtml({
          title: 'Confirma tu nuevo correo',
          bodyHtml,
          button: { text: 'Confirmar nuevo correo', url: confirmUrl },
          branding: b,
        }),
      });
      this.logger.log(`Email de cambio de correo enviado a ${newEmail}`);
    } catch (error) {
      this.logger.error(`Error al enviar email de cambio de correo a ${newEmail}:`, error);
      throw error;
    }
  }

  private requestTypeToLabel(requestType: string): string {
    const map: Record<string, string> = {
      'apertura-llc': 'Apertura LLC',
      'renovacion-llc': 'Renovación LLC',
      'cuenta-bancaria': 'Cuenta bancaria',
    };
    return map[requestType] ?? requestType;
  }

  /**
   * Confirmación al usuario del panel que envía la solicitud (partner o cliente).
   */
  async sendPanelRequestSubmittedToActor(params: {
    email: string;
    displayName: string;
    requestId: number;
    requestType: string;
    actorType: 'partner' | 'client';
    branding?: Partial<EmailBranding>;
  }): Promise<void> {
    const { email, displayName, requestId, requestType, actorType, branding } = params;
    if (!this.resend) {
      this.logger.warn(`Email actor panel no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const b = this.mergeBranding(branding);
    const detailUrl = `${b.frontendBaseUrl}/panel/my-requests/${requestId}`;
    const typeLabel = this.requestTypeToLabel(requestType);

    const roleLine =
      actorType === 'partner'
        ? 'Como <strong>partner</strong>, registramos tu envío y el equipo lo revisará.'
        : 'Tu solicitud quedó registrada y el equipo la revisará.';

    const bodyHtml = `
      <p>Hola ${displayName || email},</p>
      <p>${roleLine}</p>
      <p><strong>Solicitud #${requestId}</strong> — ${typeLabel}</p>
      <p>Puedes seguir el estado desde tu panel.</p>
    `;

    try {
      await this.resend.emails.send({
        from: this.formatResendFrom(b),
        to: email,
        subject: `Solicitud enviada — #${requestId} (${typeLabel}) — ${b.brandDisplayName}`,
        html: this.getEmailHtml({
          title: 'Solicitud registrada',
          bodyHtml,
          button: { text: 'Ver mi solicitud', url: detailUrl },
          branding: b,
        }),
      });
      this.logger.log(`Email confirmación actor panel enviado a ${email} (request #${requestId})`);
    } catch (error) {
      this.logger.error(`Error al enviar email actor panel a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Aviso a un usuario interno (admin / user) por nueva solicitud (panel o wizard).
   */
  async sendNewRequestAlertToStaff(params: {
    toEmail: string;
    recipientName?: string;
    requestId: number;
    requestType: string;
    channel: 'portal' | 'wizard' | 'lead';
    originLabel: string;
  }): Promise<void> {
    const { toEmail, recipientName, requestId, requestType, channel, originLabel } = params;
    if (!this.resend) {
      this.logger.warn(`Email staff no enviado a ${toEmail} (Resend no configurado)`);
      return;
    }

    const frontendUrl =
      this.configService.get<string>('FRONTEND_URL') || 'http://localhost:4200';
    const adminUrl = `${frontendUrl}/panel/requests/${requestId}`;
    const typeLabel = this.requestTypeToLabel(requestType);
    const channelLabel =
      channel === 'wizard' ? 'Wizard' : channel === 'lead' ? 'Lead' : 'Portal';

    const greet = recipientName ? `Hola ${recipientName},` : 'Hola,';
    const bodyHtml = `
      <p>${greet}</p>
      <p>Hay una <strong>nueva solicitud</strong> pendiente de revisión.</p>
      <p><strong>ID:</strong> #${requestId}<br/>
      <strong>Servicio:</strong> ${typeLabel}<br/>
      <strong>Origen:</strong> ${originLabel}<br/>
      <strong>Canal:</strong> ${channelLabel}</p>
    `;

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('RESEND_FROM_EMAIL') ||
          'Start Companies <noreply@startcompanies.us>',
        to: toEmail,
        subject: `[Nueva solicitud] #${requestId} — ${typeLabel} (${originLabel})`,
        html: this.getEmailHtml({
          title: 'Nueva solicitud',
          bodyHtml,
          button: { text: 'Abrir en el panel', url: adminUrl },
        }),
      });
      this.logger.log(`Email aviso staff enviado a ${toEmail} (request #${requestId})`);
    } catch (error) {
      this.logger.error(`Error al enviar email staff a ${toEmail}:`, error);
      throw error;
    }
  }

  private static readonly ZOHO_SYNC_CLIENT_WHATSAPP_GROUP =
    'https://chat.whatsapp.com/LLNt49kM48zCRIKVGnSVGE?mode=gi_t';

  /**
   * Bienvenida al crear usuario cliente desde import Zoho (cuenta ya creada; falta definir contraseña).
   */
  async sendZohoSyncClientWelcomeEmail(params: {
    email: string;
    displayName: string;
    setPasswordUrl: string;
  }): Promise<void> {
    const { email, displayName, setPasswordUrl } = params;
    if (!this.resend) {
      this.logger.warn(`Email bienvenida sync Zoho (cliente) no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const wa = EmailService.ZOHO_SYNC_CLIENT_WHATSAPP_GROUP;
    const bodyHtml = `
      <p>Hola ${displayName},</p>
      <p>Gracias por confiar en nosotros y renovar tu LLC con Start Companies. Para nosotros eso significa mucho y queremos seguir brindándote las mejores soluciones.</p>
      <p><strong>Tu usuario ya está registrado en la plataforma con este correo.</strong> El primer paso es <strong>definir tu contraseña</strong> y acceder usando el siguiente enlace:</p>
      <p style="word-break: break-all;"><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
      <p>Desde ahí vas a poder:</p>
      <ul style="margin: 0 0 16px; padding-left: 20px;">
        <li>Recibir notificaciones importantes de tu LLC</li>
        <li>Acceder a tus documentos</li>
        <li>En los próximos días habilitaremos: facturación, videos y documentos clave de tu LLC, y contabilidad automatizada para exportar archivos y ver el estado de resultados de tu empresa</li>
      </ul>
      <p>Por confiar en nosotros y seguir creciendo con Start Companies, tenés <strong>6 meses de acceso gratis</strong>. El acceso se activa en las próximas semanas. Si después decidís seguir, son <strong>USD 25/mes</strong>.</p>
      <p>También te invitamos a unirte a nuestro grupo oficial de WhatsApp, donde hacemos comunicaciones generales e importantes:<br/><a href="${wa}">${wa}</a></p>
      <p>Cualquier duda, escribinos.</p>
      <p>El equipo de Start Companies</p>
    `;

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('RESEND_FROM_EMAIL') ||
          'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Tu acceso a la plataforma de Start Companies 🚀',
        html: this.getEmailHtml({
          title: 'Tu acceso a la plataforma',
          bodyHtml,
          button: { text: 'Definir contraseña y acceder', url: setPasswordUrl },
        }),
      });
      this.logger.log(`Email bienvenida sync Zoho (cliente) enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email bienvenida sync Zoho (cliente) a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Bienvenida al crear usuario partner desde import Zoho (cuenta ya creada; falta definir contraseña).
   */
  async sendZohoSyncPartnerWelcomeEmail(params: {
    email: string;
    displayName: string;
    setPasswordUrl: string;
  }): Promise<void> {
    const { email, displayName, setPasswordUrl } = params;
    if (!this.resend) {
      this.logger.warn(`Email bienvenida sync Zoho (partner) no enviado a ${email} (Resend no configurado)`);
      return;
    }

    const bodyHtml = `
      <p>Hola ${displayName},</p>
      <p>Gracias por confiar en nosotros y ser parte de Start Companies como partner. Para nosotros eso significa mucho y queremos seguir construyendo juntos las mejores soluciones.</p>
      <p><strong>Tu usuario ya está creado en el portal.</strong> El primer paso es <strong>definir tu contraseña</strong> para entrar usando el siguiente enlace:</p>
      <p style="word-break: break-all;"><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>
      <p>Desde ahí vas a poder ver y gestionar todo lo relacionado a tu cuenta.</p>
      <p>El portal puede tener algunas fallas por ahora — estamos trabajando continuamente para mejorarlo y darte cada vez mejores herramientas.</p>
      <p>Cualquier duda, escribinos.</p>
      <p>El equipo de Start Companies</p>
    `;

    try {
      await this.resend.emails.send({
        from:
          this.configService.get<string>('RESEND_FROM_EMAIL') ||
          'Start Companies <noreply@startcompanies.us>',
        to: email,
        subject: 'Tu acceso al portal de partners de Start Companies 🚀',
        html: this.getEmailHtml({
          title: 'Tu acceso al portal de partners',
          bodyHtml,
          button: { text: 'Definir contraseña y acceder al portal', url: setPasswordUrl },
        }),
      });
      this.logger.log(`Email bienvenida sync Zoho (partner) enviado a ${email}`);
    } catch (error) {
      this.logger.error(`Error al enviar email bienvenida sync Zoho (partner) a ${email}:`, error);
      throw error;
    }
  }

  /**
   * Envía factura al cliente con PDF adjunto (Resend).
   * - Remitente: `RESEND_FROM_EMAIL` (dominio verificado en Resend).
   * - Respuestas: `replyTo` o variable `RESEND_REPLY_TO` (p. ej. tu buzón de facturación).
   */
  async sendInvoiceToClient(params: {
    to: string;
    invoiceNumber: string;
    totalAmount: number;
    currency: string;
    pdfBuffer: Buffer;
    clientName?: string;
    replyTo?: string | null;
    /** Nombre legal del emisor (perfil empresa); remitente visible, mismo email de Resend. */
    issuerLegalName?: string | null;
    issuerLogoUrl?: string | null;
    issuerEmail?: string | null;
  }): Promise<void> {
    if (!this.resend) {
      this.logger.error(`Factura ${params.invoiceNumber}: RESEND_API_KEY no configurada`);
      throw new InternalServerErrorException(
        'El envío de correo no está configurado en el servidor (RESEND_API_KEY).',
      );
    }
    const configuredFrom =
      this.configService.get<string>('RESEND_FROM_EMAIL') ||
      'Start Companies <noreply@startcompanies.us>';
    const fromEmail = this.extractFromEmailAddress(configuredFrom);
    const platformName = this.configService.get<string>('EMAIL_PLATFORM_NAME')?.trim() || 'Start Companies';
    const legalIssuer = params.issuerLegalName?.trim() || '';
    /** Misma razón social que el PDF (perfil empresa); si falta, no usar "Start Companies" como emisor ficticio. */
    const issuerNameForDisplay = legalIssuer || platformName;
    const from = legalIssuer
      ? this.formatOnBehalfOfFrom(legalIssuer, platformName, fromEmail)
      : this.formatFromDisplayNameAndEmail(platformName, fromEmail);
    const replyTo =
      params.issuerEmail?.trim() ||
      params.replyTo?.trim() ||
      this.configService.get<string>('RESEND_REPLY_TO')?.trim() ||
      undefined;
    const totalLabel = `${params.currency} ${Number(params.totalAmount).toFixed(2)}`;
    const cn = params.clientName?.trim();
    const greetSafe = cn
      ? `Hola ${cn.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')},`
      : 'Hola,';
    const invTitle = `Factura ${params.invoiceNumber}`;
    const invNumSafe = String(params.invoiceNumber).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const bodyHtml = `
      <p>${greetSafe}</p>
      <p>Adjuntamos la factura <strong>${invNumSafe}</strong> por un total de <strong>${totalLabel}</strong>.</p>
      <p>Gracias por tu confianza.</p>
    `;
    const textPlain = [
      cn ? `Hola ${cn},` : 'Hola,',
      '',
      `Adjuntamos la factura ${params.invoiceNumber} por un total de ${totalLabel}.`,
      '',
      'Gracias por tu confianza.',
    ].join('\n');
    const payload: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      attachments: { filename: string; content: Buffer }[];
      replyTo?: string;
      headers?: Record<string, string>;
    } = {
      from,
      to: params.to.trim(),
      subject: `${invTitle} — ${totalLabel}`,
      html: this.getInvoiceEmailHtml({
        title: invTitle,
        bodyHtml,
        issuerName: issuerNameForDisplay,
        issuerLogoUrl: params.issuerLogoUrl ?? null,
      }),
      text: textPlain,
      attachments: [
        {
          filename: `invoice-${params.invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`,
          content: params.pdfBuffer,
        },
      ],
      headers: {
        'X-Entity-Ref-ID': `inv-${String(params.invoiceNumber).replace(/[^\w.-]+/g, '_')}-${Date.now()}`.slice(0, 240),
      },
    };
    if (replyTo) {
      payload.replyTo = replyTo;
    }
    try {
      await this.resend.emails.send(payload);
      this.logger.log(`Factura ${params.invoiceNumber} enviada por email a ${params.to}`);
    } catch (error) {
      this.logger.error(`Error enviando factura ${params.invoiceNumber} a ${params.to}:`, error);
      throw error;
    }
  }

  /**
   * Texto plano sugerido para WhatsApp (partner). No envía WA; úsalo desde CRM o integración futura.
   */
  buildZohoSyncPartnerWhatsAppText(displayName: string, portalUrl: string): string {
    return [
      `Hola ${displayName} 👋`,
      '',
      'Gracias por confiar en nosotros y ser parte de Start Companies como partner. Para nosotros eso significa mucho.',
      '',
      'Te dejamos el acceso a tu portal:',
      `👉 ${portalUrl}`,
      '',
      'Creá tu usuario y contraseña para entrar. Desde ahí vas a poder ver y gestionar todo lo relacionado a tu cuenta.',
      '',
      'El portal puede tener algunas fallas por ahora — estamos trabajando continuamente para mejorarlo y darte cada vez mejores soluciones.',
      '',
      'Cualquier duda, escribinos 🙌',
    ].join('\n');
  }
}









