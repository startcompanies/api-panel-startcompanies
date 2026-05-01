import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { BankAccount } from './entities/bank-account.entity';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';
import { AccountingCategory } from './entities/accounting-category.entity';
import { Invoice } from '../invoicing/entities/invoice.entity';
import { parseBankCsvText } from './accounting-csv.util';
import { ACCOUNT_CHART_LABELS as ACCOUNT_LABELS } from './accounting-chart.constants';
import { UserAiCredentialsService } from '../settings/user-ai-credentials.service';
import { AccountingAiSuggestService } from './accounting-ai-suggest.service';
import { ConfigService } from '@nestjs/config';

type PanelUser = { id: number; type?: string };

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly accountsRepo: Repository<BankAccount>,
    @InjectRepository(BankImport)
    private readonly importsRepo: Repository<BankImport>,
    @InjectRepository(BankTransaction)
    private readonly txRepo: Repository<BankTransaction>,
    @InjectRepository(PlSnapshot)
    private readonly snapshotsRepo: Repository<PlSnapshot>,
    @InjectRepository(AccountingCategory)
    private readonly categoriesRepo: Repository<AccountingCategory>,
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    private readonly userAiCredentials: UserAiCredentialsService,
    private readonly aiSuggest: AccountingAiSuggestService,
    private readonly config: ConfigService,
  ) {}

  private async ensureDefaultCategories(): Promise<void> {
    const n = await this.categoriesRepo.count();
    if (n > 0) return;
    const rows = [
      { name: '4000 — Ingresos por Servicios', side: 'income' as const },
      { name: '4100 — Otros Ingresos', side: 'income' as const },
      { name: '5000 — Nómina / Contratistas', side: 'expense' as const },
      { name: '5100 — Software / SaaS', side: 'expense' as const },
      { name: '5200 — Marketing / Publicidad', side: 'expense' as const },
      { name: '5300 — Honorarios Profesionales', side: 'expense' as const },
      { name: '5400 — Viajes y Gastos', side: 'expense' as const },
      { name: '5500 — Gastos Bancarios', side: 'expense' as const },
      { name: '5600 — Infraestructura / Hosting', side: 'expense' as const },
      { name: '5700 — Otros Gastos', side: 'expense' as const },
    ];
    await this.categoriesRepo.save(rows.map((r) => this.categoriesRepo.create(r)));
  }

  /** Añade cuentas mock que falten (instalaciones previas con plan reducido). */
  private async ensureExtendedCategoryPlan(): Promise<void> {
    await this.ensureDefaultCategories();
    const want: { prefix: string; name: string; side: 'income' | 'expense' }[] = [
      { prefix: '4000', name: '4000 — Ingresos por Servicios', side: 'income' },
      { prefix: '4100', name: '4100 — Otros Ingresos', side: 'income' },
      { prefix: '5000', name: '5000 — Nómina / Contratistas', side: 'expense' },
      { prefix: '5100', name: '5100 — Software / SaaS', side: 'expense' },
      { prefix: '5200', name: '5200 — Marketing / Publicidad', side: 'expense' },
      { prefix: '5300', name: '5300 — Honorarios Profesionales', side: 'expense' },
      { prefix: '5400', name: '5400 — Viajes y Gastos', side: 'expense' },
      { prefix: '5500', name: '5500 — Gastos Bancarios', side: 'expense' },
      { prefix: '5600', name: '5600 — Infraestructura / Hosting', side: 'expense' },
      { prefix: '5700', name: '5700 — Otros Gastos', side: 'expense' },
    ];
    for (const w of want) {
      const one = await this.categoriesRepo
        .createQueryBuilder('c')
        .where('c.name ILIKE :p', { p: `${w.prefix}%` })
        .getOne();
      if (!one) {
        await this.categoriesRepo.save(this.categoriesRepo.create({ name: w.name, side: w.side }));
      }
    }
  }

  async listCategories() {
    await this.ensureExtendedCategoryPlan();
    const rows = await this.categoriesRepo.find({ order: { id: 'ASC' } });
    return { income: rows.filter((r) => r.side === 'income'), expense: rows.filter((r) => r.side === 'expense') };
  }

  private async resolveCategoryIdForAccountCode(accountCode: string | null | undefined): Promise<number | null> {
    if (!accountCode) return null;
    const prefix = String(accountCode).replace(/\D/g, '').slice(0, 4) || String(accountCode).slice(0, 4);
    if (prefix.length < 4) return null;
    await this.ensureExtendedCategoryPlan();
    const hit = await this.categoriesRepo
      .createQueryBuilder('c')
      .where('c.name ILIKE :p', { p: `${prefix}%` })
      .getOne();
    return hit?.id ?? null;
  }

  async ensureDefaultBankAccount(userId: number): Promise<BankAccount> {
    let acc = await this.accountsRepo.findOne({ where: { ownerUserId: userId, active: true } });
    if (!acc) {
      acc = await this.accountsRepo.save(
        this.accountsRepo.create({
          ownerUserId: userId,
          bankName: 'Primary',
          accountMask: null,
          active: true,
        }),
      );
    }
    return acc;
  }

  previewCsv(csv: string, fileName?: string) {
    const { detectedBank, rows, totalRows } = parseBankCsvText(csv || '', fileName);
    const preview = rows.slice(0, 200).map((r) => ({
      txDate: r.txDate,
      description: r.description,
      amount: r.amount,
      bank: r.bank,
    }));
    return { detectedBank, rows: preview, totalRows };
  }

  async importCsv(
    user: PanelUser,
    body: { bankAccountId?: number; importedByUserId?: number; fileName: string; csv: string },
  ) {
    const isClient = user.type === 'client';
    let bankAccountId = body.bankAccountId;
    let importedByUserId = body.importedByUserId;
    if (isClient) {
      const acc = await this.ensureDefaultBankAccount(user.id);
      bankAccountId = acc.id;
      importedByUserId = user.id;
    }
    if (!bankAccountId || !importedByUserId) {
      throw new BadRequestException('bankAccountId e importedByUserId son obligatorios para importación admin');
    }
    const { rows } = parseBankCsvText(body.csv || '', body.fileName);
    const bankImport = await this.importsRepo.save(
      this.importsRepo.create({
        bankAccountId,
        importedByUserId,
        fileName: body.fileName || 'import.csv',
        rowsCount: rows.length,
      }),
    );
    let inserted = 0;
    for (const parsed of rows) {
      const fingerprint = createHash('sha1')
        .update(`${parsed.txDate}|${parsed.description}|${parsed.amount}`)
        .digest('hex');
      const exists = await this.txRepo.findOne({ where: { fingerprint } });
      if (exists) continue;
      await this.txRepo.save(
        this.txRepo.create({
          bankImportId: bankImport.id,
          txDate: parsed.txDate,
          description: parsed.description,
          amount: parsed.amount,
          sourceBank: parsed.bank ?? null,
          fingerprint,
        }),
      );
      inserted += 1;
    }
    return { importId: bankImport.id, rowsParsed: rows.length, rowsInserted: inserted };
  }

  private txScopeQuery(user: PanelUser) {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .innerJoin(BankImport, 'imp', 'imp.id = tx.bank_import_id')
      .innerJoin(BankAccount, 'acc', 'acc.id = imp.bank_account_id');
    if (user.type === 'client') {
      qb.andWhere('acc.owner_user_id = :uid', { uid: user.id });
    }
    return qb;
  }

  async listTransactions(user: PanelUser, uncategorized?: boolean) {
    const qb = this.txScopeQuery(user).orderBy('tx.tx_date', 'DESC').addOrderBy('tx.id', 'DESC');
    if (uncategorized) {
      qb.andWhere(
        '(tx.category_id IS NULL AND (tx.account_code IS NULL OR TRIM(tx.account_code) = \'\'))',
      );
    } else {
      qb.andWhere(
        '(tx.category_id IS NOT NULL OR (tx.account_code IS NOT NULL AND TRIM(tx.account_code) <> \'\'))',
      );
    }
    const rows = await qb.getMany();
    return rows;
  }

  async patchTransaction(
    user: PanelUser,
    txId: number,
    body: {
      categoryId?: number | null;
      accountCode?: string | null;
      accountingDate?: string | null;
      invoiceMatchNote?: string | null;
    },
  ) {
    const qb = this.txScopeQuery(user).andWhere('tx.id = :id', { id: txId });
    const row = await qb.getOne();
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    if (body.categoryId !== undefined) row.categoryId = body.categoryId;
    if (body.accountCode !== undefined) {
      row.accountCode = body.accountCode;
      if (body.accountCode && body.categoryId === undefined) {
        const cid = await this.resolveCategoryIdForAccountCode(body.accountCode);
        if (cid) row.categoryId = cid;
      }
    }
    if (body.accountingDate !== undefined) row.accountingDate = body.accountingDate;
    if (body.invoiceMatchNote !== undefined) row.invoiceMatchNote = body.invoiceMatchNote;
    return this.txRepo.save(row);
  }

  /**
   * Lote: primero reglas en todos los sin categoría; luego IA (si hay credencial y useAi) hasta tope,
   * solo para los que sigan sin cuenta.
   */
  async bulkApplySuggestedCategories(
    user: PanelUser,
    opts?: { useAi?: boolean },
  ): Promise<{
    updatedRules: number;
    updatedAi: number;
    skippedRules: number;
    skippedAi: number;
    remainingUncategorized: number;
    /** Si true, el proveedor IA devolvió 429 (cuota/créditos). */
    aiQuotaExceeded?: boolean;
    /** Status HTTP observado del proveedor IA (si aplica). */
    aiErrorStatus?: number;
  }> {
    await this.ensureExtendedCategoryPlan();
    const useAi = opts?.useAi !== false;
    let updatedRules = 0;
    let skippedRules = 0;
    let uncats = await this.listTransactions(user, true);
    for (const tx of uncats) {
      const sug = this.suggestCategoryByRules(tx.description || '');
      if (!sug.accountCode) {
        skippedRules += 1;
        continue;
      }
      const cid = await this.resolveCategoryIdForAccountCode(sug.accountCode);
      tx.accountCode = sug.accountCode;
      tx.categoryId = cid;
      tx.accountingDate = tx.accountingDate || tx.txDate;
      await this.txRepo.save(tx);
      updatedRules += 1;
    }

    let updatedAi = 0;
    let skippedAi = 0;
    let aiQuotaExceeded = false;
    let aiErrorStatus: number | undefined = undefined;
    if (useAi) {
      const cred = await this.userAiCredentials.getDecryptedForUser(user.id);
      if (cred) {
        const maxAi = parseInt(this.config.get<string>('AI_BULK_MAX_PER_REQUEST') || '20', 10);
        uncats = await this.listTransactions(user, true);
        let n = 0;
        for (const tx of uncats) {
          if (n >= maxAi) break;
          n += 1;
          try {
            const ai = await this.aiSuggest.suggestAccountCode(
              tx.description || '',
              cred.provider,
              cred.apiKey,
              { amountUsd: Number(tx.amount) },
            );
            if (!ai.accountCode) {
              if (ai.errorStatus) aiErrorStatus = aiErrorStatus ?? ai.errorStatus;
              if (ai.errorStatus === 429) aiQuotaExceeded = true;
              skippedAi += 1;
              continue;
            }
            const cid = await this.resolveCategoryIdForAccountCode(ai.accountCode);
            tx.accountCode = ai.accountCode;
            tx.categoryId = cid;
            tx.accountingDate = tx.accountingDate || tx.txDate;
            await this.txRepo.save(tx);
            updatedAi += 1;
          } catch {
            skippedAi += 1;
          }
        }
      }
    }

    const remainingUncategorized = (await this.listTransactions(user, true)).length;
    return {
      updatedRules,
      updatedAi,
      skippedRules,
      skippedAi,
      remainingUncategorized,
      ...(aiErrorStatus ? { aiErrorStatus } : {}),
      ...(aiQuotaExceeded ? { aiQuotaExceeded } : {}),
    };
  }

  /** Sugerencia: IA con clave del usuario si existe; si no o error → reglas. */
  async suggestCategory(user: PanelUser, description: string, amountUsd?: number) {
    const cred = await this.userAiCredentials.getDecryptedForUser(user.id);
    if (cred) {
      try {
        const ai = await this.aiSuggest.suggestAccountCode(
          description || '',
          cred.provider,
          cred.apiKey,
          amountUsd !== undefined && Number.isFinite(amountUsd) ? { amountUsd } : undefined,
        );
        if (ai.accountCode) {
          return {
            accountCode: ai.accountCode,
            label: ai.label,
            source: ai.source as 'anthropic' | 'openai',
          };
        }
      } catch {
        /* fallback reglas */
      }
    }
    return this.suggestCategoryByRules(description || '');
  }

  private plEligibleQuery(user: PanelUser, fromDate: string, toDate: string) {
    return this.txScopeQuery(user)
      .andWhere('tx.account_code IS NOT NULL')
      .andWhere("TRIM(tx.account_code) <> ''")
      .andWhere('COALESCE(tx.accounting_date, tx.tx_date) BETWEEN :from AND :to', { from: fromDate, to: toDate });
  }

  private accountPrefix(code: string): string {
    const digits = String(code).replace(/\D/g, '');
    return digits.slice(0, 4) || String(code).slice(0, 4);
  }

  private labelForAccount(prefix: string): string {
    return ACCOUNT_LABELS[prefix] || prefix;
  }

  async profitAndLoss(user: PanelUser, fromDate: string, toDate: string) {
    const rows = await this.plEligibleQuery(user, fromDate, toDate).getMany();
    const byPrefix = new Map<string, number>();
    for (const r of rows) {
      const p = this.accountPrefix(r.accountCode || '');
      if (p.length < 4) continue;
      byPrefix.set(p, (byPrefix.get(p) || 0) + Number(r.amount));
    }
    const incomeLines: { accountCode: string; label: string; amount: number }[] = [];
    const expenseLines: { accountCode: string; label: string; amount: number }[] = [];
    for (const [code, total] of [...byPrefix.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const line = { accountCode: code, label: this.labelForAccount(code), amount: total };
      if (code.startsWith('4')) incomeLines.push(line);
      else if (code.startsWith('5')) expenseLines.push(line);
    }
    const totalIncome = incomeLines.reduce((s, l) => s + Number(l.amount), 0);
    const totalExpense = expenseLines.reduce((s, l) => s + Math.abs(Number(l.amount)), 0);
    const netIncome = totalIncome - totalExpense;
    const marginPct = totalIncome > 0 ? Math.round((netIncome / totalIncome) * 1000) / 10 : 0;

    let projectedPendingInvoices = 0;
    if (user.type === 'client') {
      const pending = await this.invoicesRepo.find({
        where: { ownerUserId: user.id },
      });
      projectedPendingInvoices = pending
        .filter((inv) => ['sent', 'partial', 'overdue'].includes(inv.status))
        .reduce((s, inv) => s + Number(inv.totalAmount || 0), 0);
    }

    await this.snapshotsRepo.save(
      this.snapshotsRepo.create({
        fromDate,
        toDate,
        incomeTotal: totalIncome,
        expenseTotal: totalExpense,
        netTotal: netIncome,
      }),
    );

    return {
      fromDate,
      toDate,
      basis: 'cash' as const,
      income: { lines: incomeLines, total: totalIncome },
      expense: { lines: expenseLines, total: totalExpense },
      netIncome,
      marginPct,
      projectedPendingInvoices,
    };
  }

  async profitAndLossCsv(user: PanelUser, fromDate: string, toDate: string): Promise<string> {
    const rows = await this.plEligibleQuery(user, fromDate, toDate)
      .orderBy('tx.account_code', 'ASC')
      .addOrderBy('COALESCE(tx.accounting_date, tx.tx_date)', 'ASC')
      .addOrderBy('tx.id', 'ASC')
      .getMany();
    const header = 'Fecha contable,Descripción,Código cuenta,Nombre cuenta,Monto\n';
    const body = rows
      .map((r) => {
        const fd = r.accountingDate || r.txDate;
        const prefix = this.accountPrefix(r.accountCode || '');
        const label = this.labelForAccount(prefix);
        return [
          fd,
          `"${(r.description || '').replace(/"/g, '""')}"`,
          r.accountCode ?? '',
          `"${label.replace(/"/g, '""')}"`,
          r.amount,
        ].join(',');
      })
      .join('\n');
    return header + body;
  }

  suggestCategoryByRules(description: string) {
    const d = (description || '').toLowerCase();
    const rules: { re: RegExp; code: string; label: string }[] = [
      { re: /gusto|payroll|paylocity|adp|salary|nomina/i, code: '5000', label: 'Nómina (regla)' },
      {
        re: /aws|amazon web|gcp|google cloud|azure|digitalocean|linode|vultr|heroku/i,
        code: '5600',
        label: 'Infra / hosting (regla)',
      },
      {
        re: /stripe|braintree|square fee|paypal fee|transaction fee|processing fee/i,
        code: '5500',
        label: 'Gastos bancarios / fees (regla)',
      },
      {
        re: /facebook ads|google ads|meta |tiktok ads|hubspot|mailchimp|klaviyo|semrush/i,
        code: '5200',
        label: 'Marketing (regla)',
      },
      { re: /lawyer|attorney|legal|accountant|contador|cpa|notary/i, code: '5300', label: 'Honorarios (regla)' },
      {
        re: /airbnb|hotel|marriott|hilton|flight|united airlines|american air|delta|uber|lyft|taxi/i,
        code: '5400',
        label: 'Viajes (regla)',
      },
      {
        re: /bank fee|monthly fee|wire fee|swift fee|maintenance fee|annual fee/i,
        code: '5500',
        label: 'Gastos bancarios (regla)',
      },
      {
        re: /slack|notion|figma|zoom|loom|dropbox|shopify|quickbooks|xero/i,
        code: '5100',
        label: 'Software / SaaS (regla)',
      },
      {
        re: /invoice|payment received|client payment|transfer in|deposit|ingreso|cobro/i,
        code: '4000',
        label: 'Ingresos (regla)',
      },
      { re: /interest|dividend|cashback|rewards|referral/i, code: '4100', label: 'Otros ingresos (regla)' },
    ];
    for (const r of rules) {
      if (r.re.test(d)) return { accountCode: r.code, label: r.label, source: 'rules' as const };
    }
    return { accountCode: null, label: null, source: 'rules' as const };
  }
}
