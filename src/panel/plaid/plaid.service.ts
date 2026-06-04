import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
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
import { BankAccount } from '../accounting/entities/bank-account.entity';
import { AccountingService } from '../accounting/accounting.service';
import { UserSecretEncryptionService } from '../../shared/common/services/user-secret-encryption.service';
import { PartnerTenantsService } from '../partner-tenants/partner-tenants.service';
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
    @InjectRepository(BankAccount)
    private readonly bankAccountsRepo: Repository<BankAccount>,
    private readonly accountingService: AccountingService,
    private readonly encryption: UserSecretEncryptionService,
    private readonly partnerTenantsService: PartnerTenantsService,
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
    const rows = await this.plaidItemsRepo.find({
      where: { ownerUserId },
      order: { id: 'DESC' },
    });
    return rows
      .filter((r) => r.status !== 'revoked')
      .map((r) => this.toPublicItem(r));
  }

  async getStatus(ownerUserId: number) {
    const items = await this.plaidItemsRepo.find({
      where: { ownerUserId },
    });
    const active = items.filter((i) => i.status !== 'revoked');
    return {
      configured: this.isConfigured(),
      itemsCount: active.length,
      loginRequired: active.some((i) => i.status === 'login_required'),
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

  async handleWebhook(body: PlaidWebhookBody): Promise<{ ok: true }> {
    const code = body.webhook_code;
    const plaidItemId = body.item_id;
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
}
