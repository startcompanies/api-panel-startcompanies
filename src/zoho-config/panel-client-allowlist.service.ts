import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/** Entrada en clientes-activos-panel.json (portal / data sync). */
export interface PanelClienteActivoRow {
  llcName?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  mobile?: string;
  sourceRow?: number;
}

/** Entrada en partners-panel.json */
export interface PanelPartnerRow {
  fullName?: string;
  email: string;
  mobile?: string;
}

@Injectable()
export class PanelClientAllowlistService implements OnModuleInit {
  private readonly logger = new Logger(PanelClientAllowlistService.name);
  private clientEmailsNorm = new Set<string>();
  private partnerEmailsNorm = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  /** `ZOHO_IMPORT_CLIENT_ALLOWLIST_ENABLED=true` activa el filtro en import Zoho → BD. */
  isEnabled(): boolean {
    const v = this.configService.get<string>('ZOHO_IMPORT_CLIENT_ALLOWLIST_ENABLED');
    return String(v || '').toLowerCase() === 'true';
  }

  /**
   * Nest copia `src/data/*.json` a `dist/data/`; el JS compilado suele estar en `dist/src/zoho-config/`.
   * Probamos varias rutas para dev (`src/data`) y prod (`dist/data` o `dist/src/data`).
   */
  private resolveDataJson(fileName: string): string | null {
    const candidates = [
      join(__dirname, '..', 'data', fileName),
      join(__dirname, '..', '..', 'data', fileName),
      join(process.cwd(), 'dist', 'data', fileName),
      join(process.cwd(), 'src', 'data', fileName),
    ];
    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
    return null;
  }

  private dataJsonSearchHint(fileName: string): string {
    return [
      join(__dirname, '..', 'data', fileName),
      join(__dirname, '..', '..', 'data', fileName),
      join(process.cwd(), 'dist', 'data', fileName),
      join(process.cwd(), 'src', 'data', fileName),
    ].join(' | ');
  }

  onModuleInit(): void {
    const clientsPath = this.resolveDataJson('clientes-activos-panel.json');
    const partnersPath = this.resolveDataJson('partners-panel.json');

    if (this.isEnabled()) {
      if (!clientsPath) {
        throw new Error(
          `ZOHO_IMPORT_CLIENT_ALLOWLIST_ENABLED=true pero falta clientes-activos-panel.json. Buscado en: ${this.dataJsonSearchHint('clientes-activos-panel.json')}. Copia el archivo a src/data/ y ejecuta build (assets → dist/data/).`,
        );
      }
      this.loadClientsFile(clientsPath);
      if (this.clientEmailsNorm.size === 0) {
        this.logger.warn(
          'Allowlist de clientes activa pero la lista está vacía: ningún Account pasará el filtro hasta que rellenes clientes-activos-panel.json.',
        );
      } else {
        this.logger.log(
          `Allowlist de clientes: ${this.clientEmailsNorm.size} correo(s) permitido(s) (import Zoho filtrado).`,
        );
      }
    } else {
      if (clientsPath) {
        this.loadClientsFile(clientsPath);
        this.logger.log(
          `Allowlist desactivada: cargados ${this.clientEmailsNorm.size} email(s) desde ${clientsPath} (sin filtrar import).`,
        );
      }
    }

    if (partnersPath) {
      this.loadPartnersFile(partnersPath);
      this.logger.log(
        `Partners referencia: ${this.partnerEmailsNorm.size} correo(s) en partners-panel.json (${partnersPath})`,
      );
    } else if (this.isEnabled()) {
      this.logger.warn(
        `No se encontró partners-panel.json (opcional). Buscado en: ${this.dataJsonSearchHint('partners-panel.json')}`,
      );
    }
  }

  private normEmail(email: string): string {
    return String(email || '')
      .trim()
      .toLowerCase();
  }

  private loadClientsFile(path: string): void {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as PanelClienteActivoRow[];
    if (!Array.isArray(parsed)) {
      throw new Error(`${path}: se esperaba un array JSON`);
    }
    this.clientEmailsNorm = new Set();
    for (const row of parsed) {
      const e = this.normEmail(row?.email || '');
      if (e) this.clientEmailsNorm.add(e);
    }
  }

  private loadPartnersFile(path: string): void {
    const raw = readFileSync(path, 'utf8');
    const parsed = JSON.parse(raw) as PanelPartnerRow[];
    if (!Array.isArray(parsed)) {
      this.logger.warn(`${path}: formato inválido, se esperaba array`);
      return;
    }
    this.partnerEmailsNorm = new Set();
    for (const row of parsed) {
      const e = this.normEmail(row?.email || '');
      if (e) this.partnerEmailsNorm.add(e);
    }
  }

  isClientEmailAllowed(email: string): boolean {
    if (!this.isEnabled()) return true;
    const n = this.normEmail(email);
    if (!n) return false;
    return this.clientEmailsNorm.has(n);
  }

  /** Misma regla que clientes pero contra partners-panel.json (import Zoho, Empresa Partner). */
  isPartnerEmailAllowed(email: string): boolean {
    if (!this.isEnabled()) return true;
    const n = this.normEmail(email);
    if (!n) return false;
    return this.partnerEmailsNorm.has(n);
  }

  /** Emails de partners (referencia); no depende de isEnabled. */
  getPartnerEmails(): ReadonlySet<string> {
    return this.partnerEmailsNorm;
  }

  contactEmailLooksLikePartner(contactEmail: string): boolean {
    const n = this.normEmail(contactEmail);
    return n.length > 0 && this.partnerEmailsNorm.has(n);
  }
}
