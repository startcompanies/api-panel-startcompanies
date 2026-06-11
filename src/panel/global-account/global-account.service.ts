import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  bridgeIsConfigured,
  bridgeOnboardingCancelAllowed,
  BridgeError,
  createBridgeKycLink,
  deleteBridgeCustomer,
  getBridgeKycLink,
  type BridgeKycLinkResponse,
} from '../../bridge/bridge.client';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { Request } from '../requests/entities/request.entity';
import {
  BridgeAccount,
  type BridgeAccountType,
} from './entities/bridge-account.entity';
import { BridgeWebhookEvent } from './entities/bridge-webhook-event.entity';

export type BridgeAccountSummary = {
  accountType: BridgeAccountType;
  kycStatus: string;
  tosStatus: string;
  legalName: string;
  email: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectionReasons: Array<{ reason?: string; developer_reason?: string }>;
  onboardingStarted: boolean;
  canResumeOnboarding: boolean;
  canCancelOnboarding: boolean;
};

export type GlobalAccountStatusResponse = {
  bridgeConfigured: boolean;
  /** Tipo de cuenta que ocupa el correo en Bridge (solo una por email). */
  emailLockedTo: BridgeAccountType | null;
  canCancelOnboarding: boolean;
  business: BridgeAccountSummary | null;
  individual: BridgeAccountSummary | null;
};

export type StartOnboardingResponse = {
  accountType: BridgeAccountType;
  kycStatus: string;
  tosStatus: string;
  tosLink: string | null;
  kycLink: string | null;
  iframeStep: 'tos' | 'kyc' | 'done';
};

const TERMINAL_KYC = new Set(['approved', 'rejected', 'offboarded']);
const IN_PROGRESS_KYC = new Set([
  'under_review',
  'incomplete',
  'awaiting_questionnaire',
  'awaiting_ubo',
  'paused',
]);

@Injectable()
export class GlobalAccountService {
  private readonly logger = new Logger(GlobalAccountService.name);

  constructor(
    @InjectRepository(BridgeAccount)
    private readonly bridgeAccountsRepo: Repository<BridgeAccount>,
    @InjectRepository(BridgeWebhookEvent)
    private readonly webhookEventsRepo: Repository<BridgeWebhookEvent>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    @InjectRepository(Request)
    private readonly requestsRepo: Repository<Request>,
  ) {}

  isConfigured(): boolean {
    return bridgeIsConfigured();
  }

  private requireBridge(): void {
    if (!bridgeIsConfigured()) {
      throw new ServiceUnavailableException(
        'Bridge no está configurado (BRIDGE_API_KEY / BRIDGE_BASE_URL).',
      );
    }
  }

  private callbackUrl(accountType: BridgeAccountType): string {
    const base = (process.env.FRONTEND_URL || 'http://localhost:4200').replace(
      /\/$/,
      '',
    );
    return `${base}/panel/cuenta-global/callback?accountType=${accountType}`;
  }

  private isOnboardingStarted(row: BridgeAccount): boolean {
    return Boolean(row.bridgeKycLinkId || row.bridgeCustomerId);
  }

  private findEmailLockedAccountType(
    rows: BridgeAccount[],
  ): BridgeAccountType | null {
    const linked = rows.find((r) => this.isOnboardingStarted(r));
    return linked?.accountType ?? null;
  }

  private canCancelRow(row: BridgeAccount): boolean {
    if (!bridgeOnboardingCancelAllowed()) return false;
    if (!this.isOnboardingStarted(row)) return false;
    return row.kycStatus !== 'approved';
  }

  private toSummary(row: BridgeAccount): BridgeAccountSummary {
    const done =
      row.kycStatus === 'approved' || TERMINAL_KYC.has(row.kycStatus);
    const started = this.isOnboardingStarted(row);
    return {
      accountType: row.accountType,
      kycStatus: row.kycStatus,
      tosStatus: row.tosStatus,
      legalName: row.legalName,
      email: row.email,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectionReasons: row.rejectionReasons ?? [],
      onboardingStarted: started,
      canResumeOnboarding: !done && Boolean(row.tosLink || row.kycLink),
      canCancelOnboarding: this.canCancelRow(row),
    };
  }

  private iframeStep(row: BridgeAccount): 'tos' | 'kyc' | 'done' {
    if (row.kycStatus === 'approved') return 'done';
    if (row.tosStatus !== 'approved') return 'tos';
    if (!TERMINAL_KYC.has(row.kycStatus)) return 'kyc';
    return 'done';
  }

  async getStatus(userId: number): Promise<GlobalAccountStatusResponse> {
    const rows = await this.bridgeAccountsRepo.find({ where: { userId } });
    const business = rows.find((r) => r.accountType === 'business') ?? null;
    const individual = rows.find((r) => r.accountType === 'individual') ?? null;
    const emailLockedTo = this.findEmailLockedAccountType(rows);

    return {
      bridgeConfigured: bridgeIsConfigured(),
      emailLockedTo,
      canCancelOnboarding: bridgeOnboardingCancelAllowed(),
      business: business ? this.toSummary(business) : null,
      individual: individual ? this.toSummary(individual) : null,
    };
  }

  private async resolveLegalName(
    user: User,
    accountType: BridgeAccountType,
  ): Promise<string> {
    const personal = [user.first_name, user.last_name]
      .filter(Boolean)
      .join(' ')
      .trim();

    if (accountType === 'individual') {
      return personal || user.email;
    }

    if (user.company?.trim()) {
      return user.company.trim();
    }

    const client = await this.clientsRepo.findOne({
      where: { userId: user.id },
    });
    if (client?.company?.trim()) {
      return client.company.trim();
    }

    if (client) {
      const llcName = await this.resolveLlcLegalName(client.id);
      if (llcName) return llcName;
    }

    return personal || user.email;
  }

  /** Nombre legal LLC: última solicitud de apertura o renovación (la más reciente con nombre). */
  private async resolveLlcLegalName(clientId: number): Promise<string | null> {
    const requests = await this.requestsRepo
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.aperturaLlcRequest', 'a')
      .leftJoinAndSelect('r.renovacionLlcRequest', 'ren')
      .where('r.client_id = :clientId', { clientId })
      .andWhere('r.type IN (:...types)', {
        types: ['apertura-llc', 'renovacion-llc'],
      })
      .orderBy('r.createdAt', 'DESC')
      .getMany();

    for (const req of requests) {
      const name = this.llcNameFromRequest(req);
      if (name) return name;
    }

    return null;
  }

  private llcNameFromRequest(req: Request): string | null {
    if (req.type === 'apertura-llc') {
      return req.aperturaLlcRequest?.llcName?.trim() || null;
    }
    if (req.type === 'renovacion-llc') {
      return req.renovacionLlcRequest?.llcName?.trim() || null;
    }
    return null;
  }

  private applyKycLinkResponse(
    row: BridgeAccount,
    link: BridgeKycLinkResponse,
  ): void {
    row.bridgeKycLinkId = link.id;
    row.bridgeCustomerId = link.customer_id ?? row.bridgeCustomerId;
    row.kycStatus = link.kyc_status ?? row.kycStatus;
    row.tosStatus = link.tos_status ?? row.tosStatus;
    row.tosLink = link.tos_link ?? row.tosLink;
    row.kycLink = link.kyc_link ?? row.kycLink;
    row.rejectionReasons = link.rejection_reasons ?? row.rejectionReasons;

    if (
      IN_PROGRESS_KYC.has(row.kycStatus) &&
      !row.submittedAt &&
      row.tosStatus === 'approved'
    ) {
      row.submittedAt = new Date();
    }

    if (row.kycStatus === 'approved' && !row.approvedAt) {
      row.approvedAt = new Date();
    }
  }

  async startOnboarding(
    userId: number,
    accountType: BridgeAccountType,
  ): Promise<StartOnboardingResponse> {
    this.requireBridge();

    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    let row = await this.bridgeAccountsRepo.findOne({
      where: { userId, accountType },
    });

    const legalName = await this.resolveLegalName(user, accountType);
    const email = user.email.trim();

    const userRows = await this.bridgeAccountsRepo.find({ where: { userId } });
    const emailLockedTo = this.findEmailLockedAccountType(userRows);
    if (emailLockedTo && emailLockedTo !== accountType) {
      throw new ConflictException(
        'Ya tenés una verificación activa con este correo. Continuá la existente o cancelala para iniciar otra.',
      );
    }

    if (row?.kycStatus === 'approved') {
      return {
        accountType,
        kycStatus: row.kycStatus,
        tosStatus: row.tosStatus,
        tosLink: row.tosLink,
        kycLink: row.kycLink,
        iframeStep: 'done',
      };
    }

    if (row?.bridgeKycLinkId && row.tosLink && row.kycLink) {
      try {
        const refreshed = await getBridgeKycLink(row.bridgeKycLinkId);
        this.applyKycLinkResponse(row, refreshed);
        await this.bridgeAccountsRepo.save(row);
      } catch (err) {
        this.logger.warn(
          `No se pudo refrescar kyc_link ${row.bridgeKycLinkId}: ${String(err)}`,
        );
      }

      if (row.kycStatus !== 'approved') {
        return {
          accountType,
          kycStatus: row.kycStatus,
          tosStatus: row.tosStatus,
          tosLink: row.tosLink,
          kycLink: row.kycLink,
          iframeStep: this.iframeStep(row),
        };
      }
    }

    const idempotencyKey = uuidv4();
    let link: BridgeKycLinkResponse;
    try {
      link = await createBridgeKycLink({
        full_name: legalName,
        email,
        type: accountType,
        redirect_uri: this.callbackUrl(accountType),
        idempotencyKey,
      });
    } catch (err) {
      if (err instanceof BridgeError && err.code === 'kyc_link_type_mismatch') {
        throw new ConflictException(
          'Bridge permite un solo enlace KYC por correo. Este email ya está vinculado a la verificación de empresa; para verificación personal necesitás otro correo o contactar soporte.',
        );
      }
      throw err;
    }

    if (!row) {
      row = this.bridgeAccountsRepo.create({
        userId,
        accountType,
        legalName,
        email,
        idempotencyKey,
      });
    } else {
      row.legalName = legalName;
      row.email = email;
      row.idempotencyKey = idempotencyKey;
    }

    this.applyKycLinkResponse(row, link);
    await this.bridgeAccountsRepo.save(row);

    return {
      accountType,
      kycStatus: row.kycStatus,
      tosStatus: row.tosStatus,
      tosLink: row.tosLink,
      kycLink: row.kycLink,
      iframeStep: this.iframeStep(row),
    };
  }

  async syncAccount(
    userId: number,
    accountType: BridgeAccountType,
  ): Promise<BridgeAccountSummary> {
    this.requireBridge();

    const row = await this.bridgeAccountsRepo.findOne({
      where: { userId, accountType },
    });
    if (!row?.bridgeKycLinkId) {
      throw new NotFoundException('No hay onboarding iniciado para esta cuenta.');
    }

    const link = await getBridgeKycLink(row.bridgeKycLinkId);
    this.applyKycLinkResponse(row, link);
    await this.bridgeAccountsRepo.save(row);

    return this.toSummary(row);
  }

  async cancelOnboarding(
    userId: number,
    accountType: BridgeAccountType,
  ): Promise<{ cancelled: true }> {
    this.requireBridge();

    if (!bridgeOnboardingCancelAllowed()) {
      throw new ConflictException(
        'La cancelación de verificación no está habilitada en este entorno.',
      );
    }

    const row = await this.bridgeAccountsRepo.findOne({
      where: { userId, accountType },
    });
    if (!row || !this.isOnboardingStarted(row)) {
      throw new NotFoundException('No hay verificación activa para cancelar.');
    }

    if (row.kycStatus === 'approved') {
      throw new ConflictException(
        'No se puede cancelar una cuenta global ya aprobada.',
      );
    }

    if (row.bridgeCustomerId) {
      try {
        await deleteBridgeCustomer(row.bridgeCustomerId);
      } catch (err) {
        this.logger.error(
          `Error eliminando customer Bridge ${row.bridgeCustomerId}: ${String(err)}`,
        );
        throw new ServiceUnavailableException(
          'No se pudo cancelar la verificación en Bridge. Intentá más tarde.',
        );
      }
    }

    await this.bridgeAccountsRepo.remove(row);
    return { cancelled: true };
  }

  async handleWebhook(payload: Buffer): Promise<void> {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('JSON inválido');
    }

    const eventId =
      (typeof body.event_id === 'string' && body.event_id) ||
      (typeof body.id === 'string' && body.id);
    const eventType =
      (typeof body.event_type === 'string' && body.event_type) ||
      (typeof body.type === 'string' && body.type) ||
      'unknown';

    if (eventId) {
      const exists = await this.webhookEventsRepo.findOne({
        where: { eventId },
      });
      if (exists) return;
      await this.webhookEventsRepo.save(
        this.webhookEventsRepo.create({
          eventId,
          eventType,
          payload: body,
        }),
      );
    }

    const data =
      body.data && typeof body.data === 'object'
        ? (body.data as Record<string, unknown>)
        : body;

    const customerId =
      (typeof data.customer_id === 'string' && data.customer_id) ||
      (typeof data.on_behalf_of === 'string' && data.on_behalf_of);

    if (!customerId) return;

    const row = await this.bridgeAccountsRepo.findOne({
      where: { bridgeCustomerId: customerId },
    });
    if (!row?.bridgeKycLinkId) return;

    try {
      const link = await getBridgeKycLink(row.bridgeKycLinkId);
      this.applyKycLinkResponse(row, link);
      await this.bridgeAccountsRepo.save(row);
    } catch (err) {
      this.logger.error(
        `Error sincronizando cuenta Bridge tras webhook ${eventType}: ${String(err)}`,
      );
    }
  }
}
