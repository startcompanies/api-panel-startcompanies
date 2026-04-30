import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { BankAccount } from './entities/bank-account.entity';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';
import { AccountingCategory } from './entities/accounting-category.entity';

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
  ) {}

  private async ensureDefaultCategories(): Promise<void> {
    const n = await this.categoriesRepo.count();
    if (n > 0) return;
    const rows = [
      { name: '4000 — Services / consulting', side: 'income' as const },
      { name: '4100 — Product sales', side: 'income' as const },
      { name: '5000 — Software & subscriptions', side: 'expense' as const },
      { name: '5100 — Bank fees', side: 'expense' as const },
      { name: '5200 — Travel & meals', side: 'expense' as const },
      { name: '5300 — Payroll', side: 'expense' as const },
      { name: '5400 — Taxes & compliance', side: 'expense' as const },
    ];
    await this.categoriesRepo.save(rows.map((r) => this.categoriesRepo.create(r)));
  }

  async listCategories() {
    await this.ensureDefaultCategories();
    const rows = await this.categoriesRepo.find({ order: { id: 'ASC' } });
    return { income: rows.filter((r) => r.side === 'income'), expense: rows.filter((r) => r.side === 'expense') };
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

  previewCsv(csv: string) {
    const lines = (csv || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return { detectedBank: 'unknown', rows: [] as { txDate: string; description: string; amount: number }[] };
    }
    const header = lines[0].toLowerCase();
    let detectedBank = 'generic';
    if (header.includes('relay')) detectedBank = 'Relay';
    else if (header.includes('mercury')) detectedBank = 'Mercury';
    else if (header.includes('lili')) detectedBank = 'Lili';
    else if (header.includes('chase')) detectedBank = 'Chase';
    else if (header.includes('wise')) detectedBank = 'Wise';
    else if (header.includes('brex')) detectedBank = 'Brex';

    const dataLines = lines.slice(1);
    const rows: { txDate: string; description: string; amount: number }[] = [];
    for (const line of dataLines.slice(0, 200)) {
      const parsed = this.parseCsvLine(line);
      if (parsed) rows.push(parsed);
    }
    return { detectedBank, rows, totalRows: dataLines.length };
  }

  private parseCsvLine(line: string): { txDate: string; description: string; amount: number } | null {
    const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''));
    if (parts.length < 3) return null;
    const txDate = parts[0];
    const description = parts[1];
    const amount = Number(parts[2].replace(/[^0-9.-]/g, ''));
    if (!txDate || Number.isNaN(amount)) return null;
    return { txDate, description, amount };
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
    const lines = (body.csv || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => !!line);
    const dataLines = lines.slice(1);
    const bankImport = await this.importsRepo.save(
      this.importsRepo.create({
        bankAccountId,
        importedByUserId,
        fileName: body.fileName || 'import.csv',
        rowsCount: dataLines.length,
      }),
    );
    let inserted = 0;
    for (const line of dataLines) {
      const parsed = this.parseCsvLine(line);
      if (!parsed) continue;
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
          fingerprint,
        }),
      );
      inserted += 1;
    }
    return { importId: bankImport.id, rowsParsed: dataLines.length, rowsInserted: inserted };
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
      qb.andWhere('tx.category_id IS NULL');
    } else {
      qb.andWhere('tx.category_id IS NOT NULL');
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
    if (body.accountCode !== undefined) row.accountCode = body.accountCode;
    if (body.accountingDate !== undefined) row.accountingDate = body.accountingDate;
    if (body.invoiceMatchNote !== undefined) row.invoiceMatchNote = body.invoiceMatchNote;
    return this.txRepo.save(row);
  }

  async profitAndLoss(user: PanelUser, fromDate: string, toDate: string) {
    const qb = this.txScopeQuery(user).andWhere('tx.tx_date BETWEEN :from AND :to', { from: fromDate, to: toDate });
    const rows = await qb.getMany();
    const income = rows.filter((r) => Number(r.amount) > 0).reduce((a, c) => a + Number(c.amount), 0);
    const expense = rows.filter((r) => Number(r.amount) < 0).reduce((a, c) => a + Math.abs(Number(c.amount)), 0);
    const net = income - expense;
    await this.snapshotsRepo.save(
      this.snapshotsRepo.create({
        fromDate,
        toDate,
        incomeTotal: income,
        expenseTotal: expense,
        netTotal: net,
      }),
    );
    return { fromDate, toDate, income, expense, net };
  }

  async profitAndLossCsv(user: PanelUser, fromDate: string, toDate: string): Promise<string> {
    const qb = this.txScopeQuery(user).andWhere('tx.tx_date BETWEEN :from AND :to', { from: fromDate, to: toDate });
    const rows = await qb.orderBy('tx.account_code', 'ASC').addOrderBy('tx.tx_date', 'ASC').getMany();
    const header = 'account_code,tx_date,description,amount,category_id,accounting_date,invoice_match_note\n';
    const body = rows
      .map((r) =>
        [
          r.accountCode ?? '',
          r.txDate,
          `"${(r.description || '').replace(/"/g, '""')}"`,
          r.amount,
          r.categoryId ?? '',
          r.accountingDate ?? '',
          r.invoiceMatchNote ?? '',
        ].join(','),
      )
      .join('\n');
    return header + body;
  }

  suggestCategoryByRules(description: string) {
    const d = (description || '').toLowerCase();
    if (/payroll|nomina|gusto|adp/i.test(d)) {
      return { accountCode: '5300', label: 'Payroll (regla)', source: 'rules' as const };
    }
    if (/stripe|square|shopify|sale|invoice|payment received/i.test(d)) {
      return { accountCode: '4000', label: 'Ingresos / cobros (regla)', source: 'rules' as const };
    }
    if (/aws|google|saas|subscription|software/i.test(d)) {
      return { accountCode: '5000', label: 'Software (regla)', source: 'rules' as const };
    }
    if (/fee|bank|wire|ach/i.test(d)) {
      return { accountCode: '5100', label: 'Comisiones bancarias (regla)', source: 'rules' as const };
    }
    if (/uber|lyft|flight|hotel|meal/i.test(d)) {
      return { accountCode: '5200', label: 'Viajes / comidas (regla)', source: 'rules' as const };
    }
    return { accountCode: null, label: null, source: 'rules' as const };
  }
}
