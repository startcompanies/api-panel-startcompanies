import {
  BadRequestException,
  ForbiddenException,
  HttpCode,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type Transaction,
} from 'plaid';
import { PlaidItem, type PlaidItemStatus } from './entities/plaid-item.entity';
import { PlaidWebhookEvent } from './entities/plaid-webhook-event.entity';
import { PlaidConnectReminder } from './entities/plaid-connect-reminder.entity';
import { BankAccount } from '../accounting/entities/bank-account.entity';
import { User } from '../../shared/user/entities/user.entity';
import { Client } from '../clients/entities/client.entity';
import { AccountingService } from '../accounting/accounting.service';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';
import { EmailService } from '../../shared/common/services/email.service';
import { PartnerTenantsService } from '../partner-tenants/partner-tenants.service';
import { PlaidWebhookVerifyService } from './plaid-webhook-verify.service';
import { hasPlatformFeature } from '../../shared/common/utils/platform-features.util';
import type { PlatformFeatures } from '../pricing/entities/pricing-plan.entity';
import { mapPlaidTransactionToImportRow } from './plaid-transaction.util';

type PlaidWebhookBody = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
  error?: { error_code?: string };
};

@Injectable()
export class PlaidService {
  private readonly logger = new Logger(PlaidService.name);
  private client: PlaidApi | null = null;

  constructor(
    @InjectRepository(PlaidItem)
    private readonly plaidItemsRepo: Repository<PlaidItem>,
    @InjectRepository(PlaidWebhookEvent)
    private readonly webhookEventsRepo: Repository<PlaidWebhookEvent>,
    @InjectRepository(PlaidConnectReminder)
    private readonly connectRemindersRepo: Repository<PlaidConnectReminder>,
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepo: Repository<BankAccount>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Client)
    private readonly clientsRepo: Repository<Client>,
    private readonly accountingService: AccountingService,
    private readonly encryption: UserSecretEncryptionService,
    private readonly partnerTenantsService: PartnerTenantsService,
    private readonly webhookVerify: PlaidWebhookVerifyService,
    private readonly emailService: EmailService,
  ) {}

  isConfigured(): boolean {
    return Boolean(
      process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim(),
    );
  }

  private requireConfigured(): PlaidApi {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Plaid no está configurado (PLAID_CLIENT_ID / PLAID_SECRET).',
      );
    }
    if (!this.client) {
      const env =
        process.env.PLAID_ENV === 'production'
          ? PlaidEnvironments.production
          : PlaidEnvironments.sandbox;
      this.client = new PlaidApi(
        new Configuration({
          basePath: env,
          baseOptions: {
            headers: {
              'PLAID-CLIENT-ID': process.env.PLAID_CLIENT_ID!.trim(),
              'PLAID-SECRET': process.env.PLAID_SECRET!.trim(),
            },
          },
        }),
      );
    }
    return this.client;
  }

  private requireEncryptionKey(): void {
    if (!process.env.USER_SECRETS_ENCRYPTION_KEY?.trim()) {
      throw new BadRequestException(
        'USER_SECRETS_ENCRYPTION_KEY no configurada; no se pueden guardar tokens Plaid.',
      );
    }
  }

  private async isPartnerClient(userId: number): Promise<boolean> {
    const client = await this.clientsRepo.findOne({
      where: { userId },
      select: ['id', 'partnerId'],
    });
    return !!client?.partnerId;
  }

  async userHasAccountingPlaid(userId: number): Promise<boolean> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'type', 'platformFeatures'],
    });
    if (!user || user.type !== 'client') return false;
    const isPartnerClient = await this.isPartnerClient(userId);
    return hasPlatformFeature(
      user.platformFeatures as PlatformFeatures | null | undefined,
      'accountingPlaid',
      { isPartnerClient },
    );
  }

  private async assertAccountingPlaidAccess(userId: number): Promise<void> {
    const user = await this.usersRepo.findOne({
      where: { id: userId },
      select: ['id', 'type', 'platformFeatures'],
    });
    if (!user || user.type !== 'client') {
      throw new ForbiddenException('Plaid solo está disponible para clientes.');
    }
    const isPartnerClient = await this.isPartnerClient(userId);
    if (
      !hasPlatformFeature(
        user.platformFeatures as PlatformFeatures | null | undefined,
        'accountingPlaid',
        { isPartnerClient },
      )
    ) {
      throw new ForbiddenException(
        'Tu plan no incluye sincronización bancaria con Plaid.',
      );
    }
  }

  private decryptAccessToken(item: PlaidItem): string {
    return this.encryption.decrypt(
      item.accessTokenCiphertext,
      item.accessTokenIv,
      item.accessTokenAuthTag,
    );
  }

  private storeAccessToken(token: string): Pick<
    PlaidItem,
    'accessTokenCiphertext' | 'accessTokenIv' | 'accessTokenAuthTag'
  > {
    const enc = this.encryption.encrypt(token);
    return {
      accessTokenCiphertext: enc.ciphertext,
      accessTokenIv: enc.iv,
      accessTokenAuthTag: enc.authTag,
    };
  }

  private async resolveLinkClientName(tenantHost?: string): Promise<string> {
    const override = process.env.PLAID_LINK_CLIENT_NAME?.trim();
    if (override) return override;
    const host = tenantHost?.trim();
    if (host) {
      try {
        const tenant = await this.partnerTenantsService.resolveByHost(host);
        if (tenant.kind === 'partner' && tenant.displayName) {
          return tenant.displayName;
        }
      } catch {
        /* fallback */
      }
    }
    return process.env.EMAIL_PLATFORM_NAME?.trim() || 'Start Companies';
  }

  private mapPlaidTransaction(
    tx: Transaction,
    institutionName: string | null,
  ) {
    return mapPlaidTransactionToImportRow(tx, institutionName);
  }

  private plaidErrorMessage(err: unknown): string {
    const e = err as { response?: { data?: { error_message?: string; error_code?: string } } };
    const data = e?.response?.data;
    if (data?.error_message) {
      return `${data.error_code || 'PLAID_ERROR'}: ${data.error_message}`;
    }
    return err instanceof Error ? err.message : String(err);
  }

  private isLoginRequiredError(err: unknown): boolean {
    const e = err as { response?: { data?: { error_code?: string } } };
    const code = e?.response?.data?.error_code;
    return code === 'ITEM_LOGIN_REQUIRED';
  }

  async createLinkToken(
    ownerUserId: number,
    tenantHost?: string,
    plaidItemDbId?: number,
  ) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    const plaid = this.requireConfigured();
    const clientName = await this.resolveLinkClientName(tenantHost);
    const request: Parameters<PlaidApi['linkTokenCreate']>[0] = {
      user: { client_user_id: String(ownerUserId) },
      client_name: clientName,
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'es',
    };
    const webhookUrl = process.env.PLAID_WEBHOOK_URL?.trim();
    if (webhookUrl) {
      request.webhook = webhookUrl;
    }
    if (plaidItemDbId) {
      const item = await this.getOwnedItem(ownerUserId, plaidItemDbId);
      if (item.status === 'revoked') {
        throw new BadRequestException('Esta conexión bancaria fue revocada.');
      }
      request.access_token = this.decryptAccessToken(item);
    }
    try {
      const res = await plaid.linkTokenCreate(request);
      return {
        linkToken: res.data.link_token,
        expiration: res.data.expiration,
        clientName,
      };
    } catch (err) {
      this.logger.error(`linkTokenCreate: ${this.plaidErrorMessage(err)}`);
      throw new HttpException(
        this.plaidErrorMessage(err),
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async exchangePublicToken(
    ownerUserId: number,
    publicToken: string,
    metadata?: {
      institution?: { institution_id?: string; name?: string };
      accounts?: Array<{ mask?: string }>;
    },
  ) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    this.requireEncryptionKey();
    const plaid = this.requireConfigured();
    let accessToken: string;
    let plaidItemId: string;
    try {
      const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
      accessToken = exchange.data.access_token;
      plaidItemId = exchange.data.item_id;
    } catch (err) {
      this.logger.error(`itemPublicTokenExchange: ${this.plaidErrorMessage(err)}`);
      throw new HttpException(
        this.plaidErrorMessage(err),
        HttpStatus.BAD_GATEWAY,
      );
    }

    const institutionId = metadata?.institution?.institution_id ?? null;
    let institutionName = metadata?.institution?.name ?? null;
    const accountMask = metadata?.accounts?.[0]?.mask ?? null;

    if (!institutionName) {
      institutionName = 'Plaid Bank';
    }

    let bankAccount = await this.bankAccountsRepo.findOne({
      where: { ownerUserId, active: true },
    });
    if (!bankAccount) {
      bankAccount = await this.bankAccountsRepo.save(
        this.bankAccountsRepo.create({
          ownerUserId,
          bankName: institutionName,
          accountMask,
          active: true,
        }),
      );
    } else {
      bankAccount.bankName = institutionName;
      if (accountMask) bankAccount.accountMask = accountMask;
      await this.bankAccountsRepo.save(bankAccount);
    }

    const tokenFields = this.storeAccessToken(accessToken);
    let item = await this.plaidItemsRepo.findOne({ where: { plaidItemId } });
    if (item) {
      Object.assign(item, {
        ...tokenFields,
        ownerUserId,
        bankAccountId: bankAccount.id,
        institutionId,
        institutionName,
        accountMask,
        status: 'active' as PlaidItemStatus,
        lastSyncError: null,
      });
    } else {
      item = this.plaidItemsRepo.create({
        ownerUserId,
        bankAccountId: bankAccount.id,
        plaidItemId,
        ...tokenFields,
        institutionId,
        institutionName,
        accountMask,
        status: 'active',
        syncCursor: null,
      });
    }
    item = await this.plaidItemsRepo.save(item);

    const syncSummary = await this.syncItemRecord(item);
    return {
      item: this.toPublicItem(item),
      syncSummary,
    };
  }

  async listItems(ownerUserId: number) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    const rows = await this.plaidItemsRepo.find({
      where: { ownerUserId },
      order: { id: 'DESC' },
    });
    return rows
      .filter((r) => r.status !== 'revoked')
      .map((r) => this.toPublicItem(r));
  }

  async getStatus(ownerUserId: number) {
    const featureEnabled = await this.userHasAccountingPlaid(ownerUserId);
    const items = await this.plaidItemsRepo.find({
      where: { ownerUserId },
    });
    const active = items.filter((i) => i.status !== 'revoked');
    return {
      configured: this.isConfigured() && featureEnabled,
      featureEnabled,
      itemsCount: active.length,
      loginRequired: active.some((i) => i.status === 'login_required'),
    };
  }

  /** Saldo actual de cuentas de depósito conectadas vía Plaid (útil para renovación LLC). */
  async getBankBalance(ownerUserId: number) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    const plaid = this.requireConfigured();
    const items = await this.plaidItemsRepo.find({
      where: { ownerUserId },
    });
    const active = items.filter((i) => i.status === 'active' || i.status === 'login_required');
    if (active.length === 0) {
      throw new NotFoundException('No hay bancos conectados vía Plaid.');
    }

    let total = 0;
    const accounts: Array<{
      institutionName: string | null;
      name: string;
      mask: string | null;
      balance: number;
      currency: string;
    }> = [];

    for (const item of active) {
      if (item.status === 'revoked') continue;
      try {
        const accessToken = this.decryptAccessToken(item);
        const res = await plaid.accountsGet({ access_token: accessToken });
        for (const acc of res.data.accounts || []) {
          if (acc.type !== 'depository') continue;
          const current = Number(acc.balances?.current ?? acc.balances?.available ?? 0);
          if (!Number.isFinite(current)) continue;
          total += current;
          accounts.push({
            institutionName: item.institutionName,
            name: acc.name || acc.official_name || 'Account',
            mask: acc.mask ?? item.accountMask,
            balance: current,
            currency: acc.balances?.iso_currency_code || 'USD',
          });
        }
      } catch (err) {
        this.logger.warn(
          `accountsGet item=${item.plaidItemId}: ${this.plaidErrorMessage(err)}`,
        );
      }
    }

    if (accounts.length === 0) {
      throw new BadRequestException(
        'No se pudo obtener saldo de las cuentas conectadas.',
      );
    }

    return {
      totalBalance: Math.round(total * 100) / 100,
      currency: accounts[0]?.currency || 'USD',
      asOf: new Date().toISOString(),
      source: 'plaid' as const,
      accounts,
    };
  }

  private toPublicItem(item: PlaidItem) {
    return {
      id: item.id,
      plaidItemId: item.plaidItemId,
      bankAccountId: item.bankAccountId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      accountMask: item.accountMask,
      status: item.status,
      lastSyncedAt: item.lastSyncedAt?.toISOString() ?? null,
      lastSyncError: item.lastSyncError,
    };
  }

  private async getOwnedItem(ownerUserId: number, itemDbId: number): Promise<PlaidItem> {
    const item = await this.plaidItemsRepo.findOne({
      where: { id: itemDbId, ownerUserId },
    });
    if (!item) throw new NotFoundException('Conexión Plaid no encontrada');
    return item;
  }

  async syncItemForUser(ownerUserId: number, itemDbId: number) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    const item = await this.getOwnedItem(ownerUserId, itemDbId);
    if (item.status === 'revoked') {
      throw new BadRequestException('La conexión fue revocada.');
    }
    const summary = await this.syncItemRecord(item);
    const refreshed = await this.plaidItemsRepo.findOne({ where: { id: item.id } });
    return {
      item: refreshed ? this.toPublicItem(refreshed) : this.toPublicItem(item),
      syncSummary: summary,
    };
  }

  async disconnectItem(ownerUserId: number, itemDbId: number) {
    await this.assertAccountingPlaidAccess(ownerUserId);
    const item = await this.getOwnedItem(ownerUserId, itemDbId);
    const plaid = this.requireConfigured();
    try {
      const accessToken = this.decryptAccessToken(item);
      await plaid.itemRemove({ access_token: accessToken });
    } catch (err) {
      this.logger.warn(`itemRemove: ${this.plaidErrorMessage(err)}`);
    }
    item.status = 'revoked';
    item.lastSyncError = null;
    await this.plaidItemsRepo.save(item);
    return { ok: true };
  }

  async syncItemRecord(item: PlaidItem): Promise<{
    rowsParsed: number;
    rowsInserted: number;
    rowsSkippedDuplicates: number;
  }> {
    const plaid = this.requireConfigured();
    const accessToken = this.decryptAccessToken(item);
    const institutionName = item.institutionName;
    const allTx: Transaction[] = [];
    let cursor = item.syncCursor ?? undefined;
    let hasMore = true;

    try {
      while (hasMore) {
        const res = await plaid.transactionsSync({
          access_token: accessToken,
          cursor,
        });
        allTx.push(...(res.data.added || []));
        cursor = res.data.next_cursor;
        hasMore = res.data.has_more;
      }
    } catch (err) {
      const msg = this.plaidErrorMessage(err);
      if (this.isLoginRequiredError(err)) {
        item.status = 'login_required';
        item.lastSyncError = msg;
        await this.plaidItemsRepo.save(item);
        throw new BadRequestException(
          'El banco requiere reconectar la cuenta (login requerido).',
        );
      }
      item.status = 'error';
      item.lastSyncError = msg;
      await this.plaidItemsRepo.save(item);
      throw new HttpException(msg, HttpStatus.BAD_GATEWAY);
    }

    const rows = allTx.map((tx) => this.mapPlaidTransaction(tx, institutionName));
    const label = `plaid-sync-${institutionName || 'bank'}-${new Date().toISOString().slice(0, 19)}`;
    const result = await this.accountingService.importPlaidTransactions(
      item.ownerUserId,
      item.bankAccountId,
      rows,
      label,
    );

    item.syncCursor = cursor ?? item.syncCursor;
    item.lastSyncedAt = new Date();
    item.lastSyncError = null;
    item.status = 'active';
    await this.plaidItemsRepo.save(item);

    return {
      rowsParsed: result.rowsParsed,
      rowsInserted: result.rowsInserted,
      rowsSkippedDuplicates: result.rowsSkippedDuplicates,
    };
  }

  async handleWebhook(
    rawBody: Buffer,
    verificationHeader: string | undefined,
  ): Promise<{ ok: true }> {
    if (!this.isConfigured()) {
      return { ok: true };
    }

    const plaid = this.requireConfigured();
    const verified = await this.webhookVerify.verify(
      plaid,
      rawBody,
      verificationHeader,
    );
    if (!verified) {
      throw new UnauthorizedException('Webhook Plaid no verificado');
    }

    const eventId = createHash('sha256').update(rawBody).digest('hex');
    const existing = await this.webhookEventsRepo.findOne({ where: { id: eventId } });
    if (existing) {
      return { ok: true };
    }

    let body: PlaidWebhookBody;
    try {
      body = JSON.parse(rawBody.toString('utf8')) as PlaidWebhookBody;
    } catch {
      throw new BadRequestException('JSON inválido en webhook Plaid');
    }

    const code = body.webhook_code;
    const webhookType = body.webhook_type || 'unknown';
    const plaidItemId = body.item_id;

    await this.webhookEventsRepo.save(
      this.webhookEventsRepo.create({
        id: eventId,
        type: `${webhookType}:${code || 'unknown'}`,
        itemId: plaidItemId ?? null,
      }),
    );

    if (!plaidItemId) {
      return { ok: true };
    }
    const item = await this.plaidItemsRepo.findOne({ where: { plaidItemId } });
    if (!item || item.status === 'revoked') {
      return { ok: true };
    }

    if (code === 'SYNC_UPDATES_AVAILABLE') {
      try {
        await this.syncItemRecord(item);
      } catch (err) {
        this.logger.warn(
          `Webhook sync failed item=${plaidItemId}: ${this.plaidErrorMessage(err)}`,
        );
      }
      return { ok: true };
    }

    if (code === 'ITEM_LOGIN_REQUIRED' || body.error?.error_code === 'ITEM_LOGIN_REQUIRED') {
      item.status = 'login_required';
      item.lastSyncError = 'ITEM_LOGIN_REQUIRED';
      await this.plaidItemsRepo.save(item);
      return { ok: true };
    }

    return { ok: true };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cronSyncActiveItems(): Promise<void> {
    const enabled = process.env.PLAID_SYNC_CRON_ENABLED;
    if (enabled === 'false' || enabled === '0') return;
    if (!this.isConfigured()) return;

    const items = await this.plaidItemsRepo.find({
      where: { status: 'active' },
    });
    for (const item of items) {
      try {
        await this.syncItemRecord(item);
      } catch (err) {
        this.logger.warn(
          `Cron sync item=${item.plaidItemId}: ${this.plaidErrorMessage(err)}`,
        );
      }
    }
  }

  /** Recordatorio opcional a clientes con contabilidad sin banco conectado. */
  @Cron(CronExpression.EVERY_WEEK)
  async cronConnectBankReminders(): Promise<void> {
    const enabled = process.env.PLAID_CONNECT_REMINDER_ENABLED;
    if (enabled !== 'true' && enabled !== '1') return;
    if (!this.isConfigured()) return;

    const rows: Array<{
      user_id: number;
      email: string;
      first_name: string | null;
      last_name: string | null;
    }> = await this.usersRepo.query(`
        SELECT u.id AS user_id, u.email, u.first_name, u.last_name
        FROM users u
        LEFT JOIN plaid_items pi
          ON pi.owner_user_id = u.id AND pi.status != 'revoked'
        LEFT JOIN plaid_connect_reminders pcr ON pcr.user_id = u.id
        WHERE u.type = 'client'
          AND u.email IS NOT NULL
          AND (u.platform_features->>'accounting')::boolean IS TRUE
          AND COALESCE((u.platform_features->>'accountingPlaid')::boolean, TRUE) IS TRUE
          AND pi.id IS NULL
          AND (pcr.user_id IS NULL OR pcr.sent_at < NOW() - INTERVAL '30 days')
        LIMIT 50
      `);

    const panelUrl =
      process.env.FRONTEND_PANEL_URL?.trim() ||
      process.env.FRONTEND_BASE_URL?.trim() ||
      'https://panel.startcompanies.io';

    for (const row of rows) {
      const userId = Number(row.user_id);
      if (!userId || !row.email) continue;
      const displayName =
        [row.first_name, row.last_name].filter(Boolean).join(' ').trim() || row.email;
      try {
        const sent = await this.emailService.sendPlaidConnectReminderEmail({
          email: row.email,
          name: displayName,
          panelUrl: `${panelUrl.replace(/\/$/, '')}/panel/contabilidad`,
        });
        if (sent) {
          await this.connectRemindersRepo.save(
            this.connectRemindersRepo.create({ userId, sentAt: new Date() }),
          );
        }
      } catch (err) {
        this.logger.warn(
          `Reminder Plaid user=${userId}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
