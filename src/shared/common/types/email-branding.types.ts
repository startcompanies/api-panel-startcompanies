/** Marca aplicada a plantillas de correo (white-label). */
export interface EmailBranding {
  brandDisplayName: string;
  frontendBaseUrl: string;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
}
