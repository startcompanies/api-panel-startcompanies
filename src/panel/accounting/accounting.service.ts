import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { BankAccount } from './entities/bank-account.entity';
import { BankImport } from './entities/bank-import.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { PlSnapshot } from './entities/pl-snapshot.entity';
import { AccountingCategory } from './entities/accounting-category.entity';
import { AccountCatalog } from './entities/account-catalog.entity';
import { Invoice } from '../invoicing/entities/invoice.entity';
import { bankDisplayNameToCanonicalSource, parseBankCsvText } from './accounting-csv.util';
import { ACCOUNT_CHART_LABELS as ACCOUNT_LABELS } from './accounting-chart.constants';
import { catalogCodeToLegacyCategoryPrefix } from './accounting-catalog-bridge';
import {
  CLASSIFICATION_CONFIDENCE_THRESHOLD,
  AccountingClassificationService,
} from './accounting-classification.service';
import { normalizePayeeKey } from './accounting-canonical.types';
import type { CanonicalTx } from './accounting-canonical.types';
import { PlatformAiService } from '../settings/platform-ai.service';
import { ConfigService } from '@nestjs/config';
import { UserClassificationRule } from './entities/user-classification-rule.entity';

type PanelUser = { id: number; type?: string };

@Injectable()
export class AccountingService {
  private readonly log = new Logger(AccountingService.name);

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
    @InjectRepository(AccountCatalog)
    private readonly accountCatalogRepo: Repository<AccountCatalog>,
    @InjectRepository(Invoice)
    private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(UserClassificationRule)
    private readonly rulesRepo: Repository<UserClassificationRule>,
    private readonly platformAi: PlatformAiService,
    private readonly classification: AccountingClassificationService,
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

  private async ensureDefaultAccountCatalog(): Promise<void> {
    // Solo siembra si no existe ningún código numérico (plan genérico de Ignacio)
    const n = await this.accountCatalogRepo.count({ where: { isSystem: true } });
    if (n > 0) return;
    const rows: Array<
      Pick<AccountCatalog, 'code' | 'name' | 'type' | 'plSection' | 'plGroup' | 'orderIndex' | 'isSystem' | 'isLocked' | 'active'>
    > = [
      { code: 'SALES', name: 'Ventas y desarrollo de negocio', type: 'income', plSection: 'Ingresos de explotación', plGroup: 'Ingresos y Ventas', orderIndex: 10, isSystem: true, isLocked: true, active: true },
      { code: 'OTHER_INCOME', name: 'Otros ingresos operativos', type: 'income', plSection: 'Ingresos de explotación', plGroup: 'Otros Ingresos', orderIndex: 20, isSystem: true, isLocked: true, active: true },
      { code: 'REFUNDS', name: 'Reembolsos y contracargos', type: 'expense', plSection: 'Ingresos de explotación', plGroup: 'Descuentos y Devoluciones', orderIndex: 30, isSystem: true, isLocked: true, active: true },
      { code: 'COL_SERV', name: 'Costo de servicios prestados', type: 'expense', plSection: 'Costo de Servicios', plGroup: 'Costo de Servicios', orderIndex: 40, isSystem: true, isLocked: true, active: true },
      { code: 'ADMIN', name: 'Administración y gastos generales', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 50, isSystem: true, isLocked: true, active: true },
      { code: 'ADMIN/SOFTWARES', name: 'Software administrativo y SaaS', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 60, isSystem: true, isLocked: true, active: true },
      { code: 'ADMIN/OTHER', name: 'Otros gastos administrativos', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 70, isSystem: true, isLocked: true, active: true },
      { code: 'MKT', name: 'Marketing y publicidad', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Marketing y Publicidad', orderIndex: 80, isSystem: true, isLocked: true, active: true },
      { code: 'PAYROLL', name: 'Nómina, honorarios y personal', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Nómina, Honorarios y Personal', orderIndex: 90, isSystem: true, isLocked: true, active: true },
      { code: 'RENT', name: 'Alquiler y arrendamiento', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 100, isSystem: true, isLocked: true, active: true },
      { code: 'OFFICE/EQUIPMENT', name: 'Hardware y equipamiento', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 110, isSystem: true, isLocked: true, active: true },
      { code: 'OFFICE/SUPPLIES', name: 'Suministros y materiales de oficina', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 120, isSystem: true, isLocked: true, active: true },
      { code: 'UTILITIES', name: 'Servicios públicos (agua, gas, luz)', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Servicios Públicos', orderIndex: 130, isSystem: true, isLocked: true, active: true },
      { code: 'UTILITIES/ELECTRICITY', name: 'Electricidad y energía', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Servicios Públicos', orderIndex: 140, isSystem: true, isLocked: true, active: true },
      { code: 'UTILITIES/INTERNET', name: 'Internet y telecomunicaciones', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Servicios Públicos', orderIndex: 150, isSystem: true, isLocked: true, active: true },
      { code: 'TRAVEL', name: 'Viajes y transporte', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Viajes y Transporte', orderIndex: 160, isSystem: true, isLocked: true, active: true },
      { code: 'TRAVEL/MEALS', name: 'Comidas de viaje y viáticos', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Viajes y Transporte', orderIndex: 170, isSystem: true, isLocked: true, active: true },
      { code: 'INSURANCE', name: 'Seguros', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Seguros', orderIndex: 180, isSystem: true, isLocked: true, active: true },
      { code: 'FINANCE/CARD_FEES', name: 'Comisiones de tarjetas y pasarelas', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Finanzas y Banca', orderIndex: 190, isSystem: true, isLocked: true, active: true },
      { code: 'FINANCE/INTEREST', name: 'Intereses y cargos financieros', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Finanzas y Banca', orderIndex: 200, isSystem: true, isLocked: true, active: true },
      { code: 'MEALS/ENT', name: 'Comidas y entretenimiento', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Otras categorías operativas', orderIndex: 210, isSystem: true, isLocked: true, active: true },
      { code: 'UNCAT', name: 'Sin categorizar', type: 'other', plSection: 'Gastos de Explotación', plGroup: 'Otras categorías operativas', orderIndex: 220, isSystem: true, isLocked: true, active: true },
      { code: 'INVEST', name: 'Inversiones y rendimientos', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 230, isSystem: true, isLocked: true, active: true },
      { code: 'INVEST/DIVIDENDS', name: 'Dividendos de inversiones', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 240, isSystem: true, isLocked: true, active: true },
      { code: 'INVEST/INTEREST', name: 'Ingresos por intereses', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 250, isSystem: true, isLocked: true, active: true },
      { code: 'FX/GAIN', name: 'Ganancias por tipo de cambio', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 260, isSystem: true, isLocked: true, active: true },
      { code: 'FX/LOSS', name: 'Pérdidas por tipo de cambio', type: 'expense', plSection: 'Extraordinarios', plGroup: 'Gastos extraordinarios', orderIndex: 270, isSystem: true, isLocked: true, active: true },
      { code: 'CAPITAL', name: 'Capital y distribuciones del propietario', type: 'expense', plSection: 'Extraordinarios', plGroup: 'Gastos extraordinarios', orderIndex: 280, isSystem: true, isLocked: true, active: true },
      { code: 'INTERCO', name: 'Operaciones intercompañía', type: 'other', plSection: 'Intercompany', plGroup: 'Intercompany', orderIndex: 285, isSystem: true, isLocked: true, active: true },
    ];
    await this.accountCatalogRepo.save(rows.map((r) => this.accountCatalogRepo.create(r)));
  }

  async listAccountCatalog() {
    await this.ensureDefaultAccountCatalog();
    return this.accountCatalogRepo.find({
      where: { active: true },
      order: { orderIndex: 'ASC', code: 'ASC' },
    });
  }

  async createAccountCatalogEntry(
    body: { code: string; name: string; type: 'income' | 'expense' | 'other'; plSection?: string; plGroup?: string; orderIndex?: number; active?: boolean },
  ) {
    await this.ensureDefaultAccountCatalog();
    const code = String(body.code || '').trim().toUpperCase();
    const name = String(body.name || '').trim();
    if (!code || !name) {
      throw new BadRequestException('code y name son obligatorios');
    }
    const exists = await this.accountCatalogRepo.findOne({ where: { code } });
    if (exists) throw new BadRequestException('Ya existe una cuenta con ese código');
    return this.accountCatalogRepo.save(
      this.accountCatalogRepo.create({
        code,
        name,
        type: body.type || 'other',
        plSection: body.plSection?.trim() || null,
        plGroup: body.plGroup?.trim() || null,
        orderIndex: Number(body.orderIndex ?? 9999),
        active: body.active !== false,
        isSystem: false,
        isLocked: false,
      }),
    );
  }

  async updateAccountCatalogEntry(
    id: number,
    body: { code?: string; name?: string; type?: 'income' | 'expense' | 'other'; plSection?: string | null; plGroup?: string | null; orderIndex?: number; active?: boolean },
  ) {
    await this.ensureDefaultAccountCatalog();
    const row = await this.accountCatalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    if (row.isLocked && (body.code !== undefined || body.type !== undefined)) {
      throw new BadRequestException('Las cuentas base no permiten cambiar código ni tipo');
    }
    if (body.code !== undefined) row.code = String(body.code || '').trim().toUpperCase();
    if (body.name !== undefined) row.name = String(body.name || '').trim();
    if (body.type !== undefined) row.type = body.type;
    if (body.plSection !== undefined) row.plSection = body.plSection?.trim() || null;
    if (body.plGroup !== undefined) row.plGroup = body.plGroup?.trim() || null;
    if (body.orderIndex !== undefined) row.orderIndex = Number(body.orderIndex);
    if (body.active !== undefined) row.active = body.active;
    return this.accountCatalogRepo.save(row);
  }

  async deleteAccountCatalogEntry(id: number) {
    await this.ensureDefaultAccountCatalog();
    const row = await this.accountCatalogRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Cuenta no encontrada');
    if (row.isLocked || row.isSystem) {
      throw new BadRequestException('Las cuentas base no se pueden eliminar');
    }
    await this.accountCatalogRepo.delete({ id });
    return { ok: true };
  }

  private async resolveCategoryIdForAccountCode(accountCode: string | null | undefined): Promise<number | null> {
    if (!accountCode) return null;
    const raw = String(accountCode).trim();
    const numeric = raw.replace(/\D/g, '').slice(0, 4);
    await this.ensureExtendedCategoryPlan();
    if (/^\d{4}$/.test(numeric)) {
      const hit = await this.categoriesRepo
        .createQueryBuilder('c')
        .where('c.name ILIKE :p', { p: `${numeric}%` })
        .getOne();
      return hit?.id ?? null;
    }
    const catRow = await this.accountCatalogRepo.findOne({
      where: { code: raw.toUpperCase(), active: true },
    });
    const bridgePrefix = catRow
      ? catalogCodeToLegacyCategoryPrefix(catRow.code, catRow.type)
      : null;
    if (!bridgePrefix) return null;
    const hit = await this.categoriesRepo
      .createQueryBuilder('c')
      .where('c.name ILIKE :p', { p: `${bridgePrefix}%` })
      .getOne();
    return hit?.id ?? null;
  }

  private txToCanonical(tx: BankTransaction): CanonicalTx {
    const amt = Number(tx.amount);
    return {
      date: tx.txDate,
      amount: amt,
      isIncome: amt > 0,
      description: tx.description || '',
      payeeNormalized: tx.payeeNormalized || normalizePayeeKey(tx.description),
      source: bankDisplayNameToCanonicalSource(tx.sourceBank || ''),
    };
  }

  private async resolveBankTxOwnerUserId(txId: number, user: PanelUser): Promise<number | null> {
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .innerJoin(BankImport, 'imp', 'imp.id = tx.bank_import_id')
      .innerJoin(BankAccount, 'acc', 'acc.id = imp.bank_account_id')
      .select('acc.owner_user_id', 'ownerId')
      .where('tx.id = :id', { id: txId });
    if (user.type === 'client') {
      qb.andWhere('acc.owner_user_id = :uid', { uid: user.id });
    }
    const raw = await qb.getRawOne<{ ownerId: number }>();
    return raw?.ownerId ?? null;
  }

  private async upsertUserClassificationRule(
    ownerUserId: number,
    payeeKey: string,
    accountCode: string,
    sourceFilter: string | null,
    createdFromTxId: number,
  ) {
    const code = accountCode.trim().toUpperCase();
    const sf = sourceFilter?.trim() || null;
    const existing = sf
      ? await this.rulesRepo.findOne({ where: { ownerUserId, payeeKey, sourceFilter: sf } })
      : await this.rulesRepo.findOne({ where: { ownerUserId, payeeKey, sourceFilter: IsNull() } });
    if (existing) {
      existing.accountCode = code;
      existing.active = true;
      existing.createdFromTxId = createdFromTxId;
      await this.rulesRepo.save(existing);
      return;
    }
    await this.rulesRepo.save(
      this.rulesRepo.create({
        ownerUserId,
        payeeKey,
        accountCode: code,
        sourceFilter: sf,
        active: true,
        createdFromTxId,
      }),
    );
  }

  /**
   * Reglas inferidas desde movimientos históricos ya categorizados.
   * Sirve como fallback cuando aún no existen reglas manuales explícitas.
   */
  private async inferRulesFromClassifiedHistory(ownerIds: number[]): Promise<Map<number, UserClassificationRule[]>> {
    const out = new Map<number, UserClassificationRule[]>();
    if (!ownerIds.length) return out;
    await this.ensureExtendedCategoryPlan();

    const categories = await this.categoriesRepo.find();
    const categoryPrefixById = new Map<number, string>();
    for (const c of categories) {
      const m = String(c.name || '').match(/(\d{4})/);
      if (m?.[1]) categoryPrefixById.set(c.id, m[1]);
    }

    const rows = await this.txRepo
      .createQueryBuilder('tx')
      .innerJoin(BankImport, 'imp', 'imp.id = tx.bank_import_id')
      .innerJoin(BankAccount, 'acc', 'acc.id = imp.bank_account_id')
      .select('acc.owner_user_id', 'ownerId')
      .addSelect('tx.payee_normalized', 'payeeNormalized')
      .addSelect('tx.description', 'description')
      .addSelect('tx.account_code', 'accountCode')
      .addSelect('tx.category_id', 'categoryId')
      .where('acc.owner_user_id IN (:...ownerIds)', { ownerIds })
      .andWhere(
        "((tx.account_code IS NOT NULL AND TRIM(tx.account_code) <> '') OR tx.category_id IS NOT NULL)",
      )
      // Correcciones recientes primero para que tengan mayor peso en el conteo de frecuencia
      .orderBy('tx.updated_at', 'DESC')
      .getRawMany<{
        ownerId: number;
        payeeNormalized: string | null;
        description: string | null;
        accountCode: string | null;
        categoryId: number | null;
      }>();

    const freq = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const ownerId = Number(r.ownerId);
      const payeeKey = String(r.payeeNormalized || '').trim() || normalizePayeeKey(String(r.description || ''));
      let accountCode = String(r.accountCode || '').trim().toUpperCase();
      if (!accountCode) {
        const categoryId = Number(r.categoryId || 0);
        const prefix = categoryPrefixById.get(categoryId);
        if (prefix) {
          accountCode = this.legacyNumericToCatalogCode(prefix) || '';
        }
      }
      if (!ownerId || payeeKey.length < 3 || !accountCode) continue;
      const k = `${ownerId}::${payeeKey}`;
      if (!freq.has(k)) freq.set(k, new Map<string, number>());
      const byCode = freq.get(k)!;
      byCode.set(accountCode, (byCode.get(accountCode) || 0) + 1);
    }

    for (const [k, byCode] of freq.entries()) {
      const [ownerIdRaw, payeeKey] = k.split('::');
      const ownerId = Number(ownerIdRaw);
      let bestCode = '';
      let bestCount = 0;
      for (const [code, count] of byCode.entries()) {
        if (count > bestCount) {
          bestCode = code;
          bestCount = count;
        }
      }
      if (!bestCode) continue;
      // Requiere al menos 2 ocurrencias para evitar que un error manual se convierta en regla
      if (bestCount < 2) continue;
      if (!out.has(ownerId)) out.set(ownerId, []);
      out.get(ownerId)!.push({
        id: 0,
        ownerUserId: ownerId,
        payeeKey,
        accountCode: bestCode,
        sourceFilter: null,
        active: true,
        createdFromTxId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      });
    }

    return out;
  }

  private legacyNumericToCatalogCode(digits: string): string | null {
    const MAP: Record<string, string> = {
      '4000': 'SALES',
      '4100': 'OTHER_INCOME',
      '5000': 'PAYROLL',
      '5100': 'ADMIN/SOFTWARES',
      '5200': 'MKT',
      '5300': 'PAYROLL',
      '5400': 'TRAVEL',
      '5500': 'FINANCE/CARD_FEES',
      '5600': 'UTILITIES/INTERNET',
      '5700': 'UNCAT',
    };
    return MAP[digits] ?? null;
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

  /** Evita duplicar el mismo movimiento importado por CSV y por Plaid. */
  private async hasCrossSourceDuplicate(
    bankAccountId: number,
    txDate: string,
    amount: number,
    payeeNormalized: string | null,
  ): Promise<boolean> {
    const absAmt = Math.abs(Number(amount));
    const qb = this.txRepo
      .createQueryBuilder('tx')
      .innerJoin(BankImport, 'imp', 'imp.id = tx.bank_import_id')
      .where('imp.bank_account_id = :bankAccountId', { bankAccountId })
      .andWhere('tx.tx_date = :txDate', { txDate })
      .andWhere('ABS(tx.amount::numeric) = :absAmt', { absAmt });
    const pk = payeeNormalized?.trim();
    if (pk && pk.length >= 3) {
      qb.andWhere('tx.payee_normalized = :pk', { pk });
    }
    const n = await qb.getCount();
    return n > 0;
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
    let skippedDuplicates = 0;
    for (const parsed of rows) {
      const fingerprint = createHash('sha1')
        .update(`${bankAccountId}|${parsed.txDate}|${parsed.description}|${parsed.amount}`)
        .digest('hex');
      const exists = await this.txRepo.findOne({ where: { fingerprint } });
      if (exists) {
        skippedDuplicates += 1;
        continue;
      }
      if (
        await this.hasCrossSourceDuplicate(
          bankAccountId,
          parsed.txDate,
          parsed.amount,
          parsed.payeeNormalized ?? null,
        )
      ) {
        skippedDuplicates += 1;
        continue;
      }
      await this.txRepo.save(
        this.txRepo.create({
          bankImportId: bankImport.id,
          txDate: parsed.txDate,
          description: parsed.description,
          amount: parsed.amount,
          sourceBank: parsed.bank ?? null,
          payeeNormalized: parsed.payeeNormalized ?? null,
          fingerprint,
        }),
      );
      inserted += 1;
    }
    return {
      importId: bankImport.id,
      rowsParsed: rows.length,
      rowsInserted: inserted,
      rowsSkippedDuplicates: skippedDuplicates,
      duplicatedImport: inserted === 0 && rows.length > 0,
    };
  }

  /** Filas normalizadas desde Plaid (amount ya con signo contable: positivo = ingreso). */
  async importPlaidTransactions(
    ownerUserId: number,
    bankAccountId: number,
    rows: Array<{
      transactionId: string;
      txDate: string;
      description: string;
      amount: number;
      sourceBank: string | null;
      payeeNormalized: string | null;
    }>,
    importLabel: string,
  ) {
    const bankImport = await this.importsRepo.save(
      this.importsRepo.create({
        bankAccountId,
        importedByUserId: ownerUserId,
        fileName: importLabel,
        rowsCount: rows.length,
      }),
    );
    let inserted = 0;
    let skippedDuplicates = 0;
    for (const parsed of rows) {
      const fingerprint = `plaid:${parsed.transactionId}`;
      const exists = await this.txRepo.findOne({ where: { fingerprint } });
      if (exists) {
        skippedDuplicates += 1;
        continue;
      }
      if (
        await this.hasCrossSourceDuplicate(
          bankAccountId,
          parsed.txDate,
          parsed.amount,
          parsed.payeeNormalized,
        )
      ) {
        skippedDuplicates += 1;
        continue;
      }
      await this.txRepo.save(
        this.txRepo.create({
          bankImportId: bankImport.id,
          txDate: parsed.txDate,
          description: parsed.description,
          amount: parsed.amount,
          sourceBank: parsed.sourceBank,
          payeeNormalized: parsed.payeeNormalized,
          fingerprint,
        }),
      );
      inserted += 1;
    }
    return {
      importId: bankImport.id,
      rowsParsed: rows.length,
      rowsInserted: inserted,
      rowsSkippedDuplicates: skippedDuplicates,
    };
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

  async listTransactions(
    user: PanelUser,
    opts?: boolean | { uncategorized?: boolean; needsReview?: boolean },
  ) {
    const o = typeof opts === 'boolean' ? { uncategorized: opts } : opts ?? {};
    const qb = this.txScopeQuery(user).orderBy('tx.tx_date', 'DESC').addOrderBy('tx.id', 'DESC');
    if (o.needsReview) {
      qb.andWhere('tx.needs_review = TRUE')
        .andWhere("tx.suggested_account_code IS NOT NULL AND TRIM(tx.suggested_account_code) <> ''");
    } else if (o.uncategorized) {
      qb.andWhere("(tx.account_code IS NULL OR TRIM(tx.account_code) = '')");
    } else {
      qb.andWhere("(tx.account_code IS NOT NULL AND TRIM(tx.account_code) <> '')");
    }
    return qb.getMany();
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
      const trimmed = body.accountCode?.trim();
      if (trimmed) {
        const ownerId = await this.resolveBankTxOwnerUserId(txId, user);
        const payeeKey = row.payeeNormalized || normalizePayeeKey(row.description);
        if (ownerId && payeeKey.length >= 3) {
          await this.upsertUserClassificationRule(ownerId, payeeKey, trimmed, null, txId);
        }
        row.classificationSource = 'manual';
        row.classificationConfidence = null;
        row.needsReview = false;
        row.categorizationStatus = 'categorizado';
        row.suggestedAccountCode = null;
      } else {
        row.classificationSource = null;
        row.classificationConfidence = null;
        row.needsReview = false;
        row.categorizationStatus = 'pendiente';
        row.suggestedAccountCode = null;
        if (body.categoryId === undefined) row.categoryId = null;
      }
      if (trimmed && body.categoryId === undefined) {
        const cid = await this.resolveCategoryIdForAccountCode(trimmed);
        if (cid) row.categoryId = cid;
      }
    }
    if (body.accountingDate !== undefined) row.accountingDate = body.accountingDate;
    if (body.invoiceMatchNote !== undefined) row.invoiceMatchNote = body.invoiceMatchNote;
    return this.txRepo.save(row);
  }

  /**
   * Motor por capas (exacto → difuso → IA) contra `account_catalog`, umbral 0.80.
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
    needsReview?: number;
    aiQuotaExceeded?: boolean;
    aiErrorStatus?: number;
    aiStoppedEarly?: boolean;
  }> {
    await this.ensureExtendedCategoryPlan();
    await this.ensureDefaultAccountCatalog();
    const useAiRequested = opts?.useAi !== false;
    let updatedRules = 0;
    let updatedAi = 0;
    let skippedRules = 0;
    let skippedAi = 0;
    let aiQuotaExceeded = false;
    let aiErrorStatus: number | undefined;
    let aiStoppedEarly = false;

    const catalog = await this.accountCatalogRepo.find({ where: { active: true } });
    const uncats = await this.listTransactions(user, { uncategorized: true });
    const importIds = [...new Set(uncats.map((t) => t.bankImportId))];
    const imports = importIds.length ? await this.importsRepo.findBy({ id: In(importIds) }) : [];
    const accIds = [...new Set(imports.map((i) => i.bankAccountId))];
    const accs = accIds.length ? await this.accountsRepo.findBy({ id: In(accIds) }) : [];
    const ownerByAccId = new Map(accs.map((a) => [a.id, a.ownerUserId]));
    const ownerByImportId = new Map(
      imports.map((i) => [i.id, ownerByAccId.get(i.bankAccountId) ?? null]),
    );
    const owners = [...new Set([...ownerByImportId.values()].filter((x): x is number => x != null))];
    const rulesByOwner = new Map<number, UserClassificationRule[]>();
    const inferredByOwner = await this.inferRulesFromClassifiedHistory(owners);
    for (const oid of owners) {
      const explicitRules = await this.rulesRepo.find({ where: { ownerUserId: oid, active: true } });
      const inferredRules = inferredByOwner.get(oid) ?? [];

      // Reglas manuales tienen prioridad; no duplicar payee+source.
      const existing = new Set(
        explicitRules.map((r) => `${r.payeeKey}::${(r.sourceFilter || '').toLowerCase()}`),
      );
      const merged = [...explicitRules];
      for (const ir of inferredRules) {
        const k = `${ir.payeeKey}::${(ir.sourceFilter || '').toLowerCase()}`;
        if (existing.has(k)) continue;
        merged.push(ir);
      }
      rulesByOwner.set(oid, merged);
    }

    const apiKey =
      useAiRequested && user.type === 'client'
        ? await this.platformAi.getApiKeyForUser(user)
        : null;
    const ai = apiKey ? { apiKey } : null;
    const useAi = !!ai;
    const maxAi = parseInt(this.config.get<string>('AI_BULK_MAX_PER_REQUEST') || '20', 10);
    let remainingAi = maxAi;

    for (const tx of uncats) {
      const ownerId = ownerByImportId.get(tx.bankImportId);
      const userRules = ownerId != null ? rulesByOwner.get(ownerId) ?? [] : [];
      const canonical = this.txToCanonical(tx);
      const useAiThis = !!(ai && remainingAi > 0);
      const res = await this.classification.classifyFull({
        tx: canonical,
        catalog,
        userRules,
        ai: useAiThis ? ai : null,
      });
      if (res.aiErrorStatus) {
        aiErrorStatus = aiErrorStatus ?? res.aiErrorStatus;
        if (res.aiErrorStatus === 429) {
          aiQuotaExceeded = true;
          // Fail-fast: ante cuota agotada, detenemos nuevos intentos IA en este lote.
          remainingAi = 0;
          if (!aiStoppedEarly) {
            aiStoppedEarly = true;
            this.log.warn(
              `Bulk accounting AI stopped early due to quota (429). userId=${user.id}`,
            );
          }
        }
      }
      if (res.source === 'ai') remainingAi -= 1;

      const hasSuggestion = !!res.accountCode;

      if (!hasSuggestion) {
        if (res.source === 'ai') skippedAi += 1;
        else skippedRules += 1;
        continue;
      }

      // Modo sugerencia: guardar como revision para que el usuario apruebe
      const isHighConfidence =
        res.accountCode === 'INTERCO' ||
        (!res.needsReview && res.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD);

      if (isHighConfidence) {
        // Alta confianza → aplicar directamente y marcar como categorizado
        tx.accountCode = res.accountCode;
        tx.categoryId = await this.resolveCategoryIdForAccountCode(res.accountCode);
        tx.accountingDate = tx.accountingDate || tx.txDate;
        tx.classificationSource = res.source;
        tx.classificationConfidence = Number(res.confidence.toFixed(4));
        tx.needsReview = false;
        tx.categorizationStatus = 'categorizado';
        tx.suggestedAccountCode = null;
        await this.txRepo.save(tx);
        if (res.source === 'ai') updatedAi += 1;
        else updatedRules += 1;
      } else {
        // Baja confianza → dejar como sugerencia pendiente de revisión
        tx.suggestedAccountCode = res.accountCode;
        tx.classificationSource = res.source;
        tx.classificationConfidence = Number(res.confidence.toFixed(4));
        tx.needsReview = true;
        tx.categorizationStatus = 'revision';
        await this.txRepo.save(tx);
        if (res.source === 'ai') skippedAi += 1;
        else skippedRules += 1;
      }
    }

    const remainingUncategorized = (await this.listTransactions(user, { uncategorized: true })).length;
    const needsReview = (await this.listTransactions(user, { needsReview: true })).length;
    return {
      updatedRules,
      updatedAi,
      skippedRules,
      skippedAi,
      remainingUncategorized,
      needsReview,
      ...(aiErrorStatus ? { aiErrorStatus } : {}),
      ...(aiQuotaExceeded ? { aiQuotaExceeded } : {}),
      ...(aiStoppedEarly ? { aiStoppedEarly } : {}),
    };
  }

  /** Filas marcadas en revisión sin código sugerido (legacy / migraciones). */
  private async resetOrphanReviewTransactions(user: PanelUser): Promise<number> {
    const sub = this.txScopeQuery(user)
      .select('tx.id')
      .andWhere('tx.needs_review = TRUE')
      .andWhere("(tx.suggested_account_code IS NULL OR TRIM(tx.suggested_account_code) = '')")
      .andWhere("(tx.account_code IS NULL OR TRIM(tx.account_code) = '')");
    const ids = (await sub.getMany()).map((r) => r.id);
    if (!ids.length) return 0;
    await this.txRepo
      .createQueryBuilder()
      .update(BankTransaction)
      .set({ needsReview: false, categorizationStatus: 'pendiente' })
      .whereInIds(ids)
      .execute();
    return ids.length;
  }

  /** Aprueba todas las sugerencias en revisión del usuario (scope por cuenta bancaria). */
  async bulkApproveSuggestions(user: PanelUser): Promise<{ approved: number; resetOrphans: number }> {
    const resetOrphans = await this.resetOrphanReviewTransactions(user);
    const rows = await this.listTransactions(user, { needsReview: true });
    let approved = 0;
    for (const row of rows) {
      if (!row.suggestedAccountCode?.trim()) continue;
      await this.approveSuggestion(user, row.id);
      approved += 1;
    }
    return { approved, resetOrphans };
  }

  /** Sugerencia alineada al catálogo + umbral; fallback plan numérico legacy. */
  /** Aprueba la sugerencia pendiente de una transacción: mueve suggestedAccountCode → accountCode. */
  async approveSuggestion(user: PanelUser, txId: number): Promise<BankTransaction> {
    const qb = this.txScopeQuery(user).andWhere('tx.id = :id', { id: txId });
    const row = await qb.getOne();
    if (!row) throw new NotFoundException('Movimiento no encontrado');
    if (!row.suggestedAccountCode)
      throw new BadRequestException('Este movimiento no tiene sugerencia pendiente');

    const code = row.suggestedAccountCode;
    row.accountCode = code;
    row.categoryId = await this.resolveCategoryIdForAccountCode(code);
    row.accountingDate = row.accountingDate || row.txDate;
    row.classificationSource = row.classificationSource ?? 'manual';
    row.needsReview = false;
    row.categorizationStatus = 'categorizado';
    row.suggestedAccountCode = null;

    // Guardar como regla para movimientos futuros similares
    const ownerId = await this.resolveBankTxOwnerUserId(txId, user);
    const payeeKey = row.payeeNormalized || normalizePayeeKey(row.description);
    if (ownerId && payeeKey.length >= 3) {
      await this.upsertUserClassificationRule(ownerId, payeeKey, code, null, txId);
    }
    return this.txRepo.save(row);
  }

  /** Rechaza la sugerencia pendiente de una transacción. */
  async rejectSuggestion(user: PanelUser, txId: number): Promise<BankTransaction> {
    const qb = this.txScopeQuery(user).andWhere('tx.id = :id', { id: txId });
    const row = await qb.getOne();
    if (!row) throw new NotFoundException('Movimiento no encontrado');

    row.suggestedAccountCode = null;
    row.needsReview = false;
    row.categorizationStatus = 'pendiente';
    return this.txRepo.save(row);
  }

  async suggestCategory(user: PanelUser, description: string, amountUsd?: number) {
    await this.ensureDefaultAccountCatalog();
    const catalog = await this.accountCatalogRepo.find({ where: { active: true } });
    const rules = await this.rulesRepo.find({ where: { ownerUserId: user.id, active: true } });
    const amt = amountUsd !== undefined && Number.isFinite(amountUsd) ? Number(amountUsd) : 0;
    const canonical: CanonicalTx = {
      date: new Date().toISOString().slice(0, 10),
      amount: amt,
      isIncome: amt > 0,
      description: description || '',
      payeeNormalized: normalizePayeeKey(description.split(/[|·]/)[0]?.trim() || description),
      source: 'generic',
    };
    const apiKey = await this.platformAi.getApiKeyForUser(user);
    const ai = apiKey ? { apiKey } : null;
    const res = await this.classification.classifyFull({
      tx: canonical,
      catalog,
      userRules: rules,
      ai,
    });
    if (res.accountCode) {
      const catHit = catalog.find((c) => c.code.toUpperCase() === res.accountCode!.toUpperCase());
      return {
        accountCode: res.accountCode,
        label: res.label ?? catHit?.name ?? res.accountCode,
        source: res.source,
        confidence: res.confidence,
        needsReview: res.needsReview,
      };
    }
    const legacy = this.suggestCategoryByRules(description || '');
    if (legacy.accountCode && /^\d{4}$/.test(legacy.accountCode)) {
      const mapped = this.legacyNumericToCatalogCode(legacy.accountCode);
      if (mapped && catalog.some((c) => c.code === mapped)) {
        const catHit = catalog.find((c) => c.code === mapped);
        return {
          accountCode: mapped,
          label: catHit?.name ?? mapped,
          source: 'fuzzy' as const,
          confidence: 0.75,
          needsReview: true,
        };
      }
    }
    return {
      accountCode: legacy.accountCode,
      label: legacy.label,
      source: legacy.source,
      confidence: legacy.accountCode ? 0.72 : 0,
      needsReview: true,
    };
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

  private monthKeysInRange(fromDate: string, toDate: string): string[] {
    const start = new Date(`${fromDate}T00:00:00Z`);
    const end = new Date(`${toDate}T00:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
    const keys: string[] = [];
    let y = start.getUTCFullYear();
    let m = start.getUTCMonth();
    const endY = end.getUTCFullYear();
    const endM = end.getUTCMonth();
    while (y < endY || (y === endY && m <= endM)) {
      keys.push(`${y}-${String(m + 1).padStart(2, '0')}`);
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return keys;
  }

  /** Agregación P&L por código de cuenta y metadatos del catálogo (INTERCO fuera del resultado operativo). */
  private buildPlSectionGroups(
    metas: Array<{
      accountCode: string;
      label: string;
      amount: number;
      orderIndex: number;
      plSection: string | null;
      plGroup: string | null;
    }>,
    monthKeys: string[],
    byCodeMonth: Map<string, Map<string, number>>,
  ): Array<{
    section: string;
    groups: Array<{
      group: string;
      lines: { accountCode: string; label: string; amount: number; monthlyAmounts: number[] }[];
    }>;
  }> {
    const sectionOrder = new Map<string, number>();
    const bySection = new Map<string, Map<string, typeof metas>>();
    for (const m of metas) {
      const sec = m.plSection || '—';
      sectionOrder.set(sec, Math.min(sectionOrder.get(sec) ?? 99999, m.orderIndex));
      if (!bySection.has(sec)) bySection.set(sec, new Map());
      const gmap = bySection.get(sec)!;
      const g = m.plGroup || '—';
      if (!gmap.has(g)) gmap.set(g, []);
      gmap.get(g)!.push(m);
    }
    const sortedSections = [...bySection.keys()].sort(
      (a, b) => (sectionOrder.get(a) ?? 0) - (sectionOrder.get(b) ?? 0),
    );
    return sortedSections.map((sec) => {
      const gmap = bySection.get(sec)!;
      const groups = [...gmap.keys()].sort();
      return {
        section: sec,
        groups: groups.map((g) => ({
          group: g,
          lines: (gmap.get(g) || []).map(({ accountCode, label, amount }) => {
            const monthTotals = byCodeMonth.get(accountCode) || new Map<string, number>();
            return {
              accountCode,
              label,
              amount,
              monthlyAmounts: monthKeys.map((mk) => Number(monthTotals.get(mk) || 0)),
            };
          }),
        })),
      };
    });
  }

  private async computeProfitAndLossCore(
    user: PanelUser,
    fromDate: string,
    toDate: string,
  ): Promise<{
    incomeLines: { accountCode: string; label: string; amount: number }[];
    expenseLines: { accountCode: string; label: string; amount: number }[];
    totalIncome: number;
    totalExpense: number;
    cogsTotal: number;
    grossProfit: number;
    grossMarginPct: number;
    netIncome: number;
    marginPct: number;
    intercompanyLines: { accountCode: string; label: string; amount: number }[];
    intercompanyTotal: number;
    sections: Array<{
      section: string;
      groups: Array<{
        group: string;
        lines: { accountCode: string; label: string; amount: number; monthlyAmounts: number[] }[];
      }>;
    }>;
    monthKeys: string[];
  }> {
    await this.ensureDefaultAccountCatalog();
    const catalogRows = await this.accountCatalogRepo.find({
      order: { orderIndex: 'ASC', code: 'ASC' },
    });
    const catalogByCode = new Map(catalogRows.map((c) => [c.code.toUpperCase(), c]));

    const rows = await this.plEligibleQuery(user, fromDate, toDate).getMany();
    const byCode = new Map<string, number>();
    const byCodeMonth = new Map<string, Map<string, number>>();
    const monthKeys = this.monthKeysInRange(fromDate, toDate);
    for (const r of rows) {
      const code = (r.accountCode || '').trim();
      if (!code) continue;
      byCode.set(code, (byCode.get(code) || 0) + Number(r.amount));
      const dt = (r.accountingDate || r.txDate || '').slice(0, 10);
      const mk = dt.length >= 7 ? dt.slice(0, 7) : '';
      if (mk) {
        if (!byCodeMonth.has(code)) byCodeMonth.set(code, new Map());
        const mm = byCodeMonth.get(code)!;
        mm.set(mk, (mm.get(mk) || 0) + Number(r.amount));
      }
    }

    const intercompanyLines: { accountCode: string; label: string; amount: number }[] = [];
    const interAmt = byCode.get('INTERCO');
    if (interAmt !== undefined) {
      intercompanyLines.push({
        accountCode: 'INTERCO',
        label: catalogByCode.get('INTERCO')?.name ?? 'INTERCO',
        amount: interAmt,
      });
      byCode.delete('INTERCO');
    }
    const intercompanyTotal = intercompanyLines.reduce((s, l) => s + Number(l.amount), 0);

    type Meta = {
      accountCode: string;
      label: string;
      amount: number;
      type: 'income' | 'expense' | 'other';
      orderIndex: number;
      plSection: string | null;
      plGroup: string | null;
    };

    const metas: Meta[] = [];
    for (const [code, amount] of byCode.entries()) {
      const cat = catalogByCode.get(code.toUpperCase());
      let type: 'income' | 'expense' | 'other';
      let label: string;
      let orderIndex: number;
      let plSection: string | null;
      let plGroup: string | null;

      if (cat) {
        type = cat.type;
        label = cat.name;
        orderIndex = cat.orderIndex;
        plSection = cat.plSection;
        plGroup = cat.plGroup;
      } else {
        const prefix = this.accountPrefix(code);
        label = this.labelForAccount(prefix.length >= 4 ? prefix : code.slice(0, 4));
        const digits = prefix.replace(/\D/g, '').slice(0, 4);
        const isIncome = digits.startsWith('4') || prefix.startsWith('4');
        type = isIncome ? 'income' : 'expense';
        orderIndex = isIncome ? 12 : 9600;
        plSection = isIncome ? 'Plan histórico (4xxx)' : 'Plan histórico (5xxx)';
        plGroup = label;
      }

      metas.push({ accountCode: code, label, amount, type, orderIndex, plSection, plGroup });
    }

    metas.sort((a, b) => a.orderIndex - b.orderIndex || a.accountCode.localeCompare(b.accountCode));

    const incomeLines = metas
      .filter((m) => m.type === 'income')
      .map(({ accountCode, label, amount }) => ({ accountCode, label, amount }));
    const expenseLines = metas
      .filter((m) => m.type === 'expense' || m.type === 'other')
      .map(({ accountCode, label, amount }) => ({ accountCode, label, amount }));

    const totalIncome = incomeLines.reduce((s, l) => s + Number(l.amount), 0);
    const totalExpense = expenseLines.reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

    // COGS: lines in "Costo de Servicios" section or codes starting with '5' / 'COL_SERV'
    const cogsTotal = metas
      .filter(
        (m) =>
          (m.type === 'expense' || m.type === 'other') &&
          (m.plSection === 'Costo de Servicios' ||
            m.accountCode.startsWith('5') ||
            m.accountCode === 'COL_SERV'),
      )
      .reduce((s, l) => s + Math.abs(Number(l.amount)), 0);

    const grossProfit = totalIncome - cogsTotal;
    const grossMarginPct =
      totalIncome > 0 ? Math.round((grossProfit / totalIncome) * 1000) / 10 : 0;

    const netIncome = totalIncome - totalExpense;
    const marginPct = totalIncome > 0 ? Math.round((netIncome / totalIncome) * 1000) / 10 : 0;

    const sections = this.buildPlSectionGroups(metas, monthKeys, byCodeMonth);

    return {
      incomeLines,
      expenseLines,
      totalIncome,
      totalExpense,
      cogsTotal,
      grossProfit,
      grossMarginPct,
      netIncome,
      marginPct,
      intercompanyLines,
      intercompanyTotal,
      sections,
      monthKeys,
    };
  }

  async profitAndLoss(user: PanelUser, fromDate: string, toDate: string) {
    const core = await this.computeProfitAndLossCore(user, fromDate, toDate);

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
        incomeTotal: core.totalIncome,
        expenseTotal: core.totalExpense,
        netTotal: core.netIncome,
      }),
    );

    return {
      fromDate,
      toDate,
      basis: 'cash' as const,
      income: { lines: core.incomeLines, total: core.totalIncome },
      expense: { lines: core.expenseLines, total: core.totalExpense },
      cogsTotal: core.cogsTotal,
      grossProfit: core.grossProfit,
      grossMarginPct: core.grossMarginPct,
      netIncome: core.netIncome,
      marginPct: core.marginPct,
      projectedPendingInvoices,
      intercompany: { lines: core.intercompanyLines, total: core.intercompanyTotal },
      sections: core.sections,
      monthKeys: core.monthKeys,
    };
  }

  /** CSV tipo estado de resultados (secciones del catálogo + INTERCO aparte). */
  /** Etiqueta corta YYYY-MM para cabeceras CSV (UTC, coherente con `monthKeysInRange`). */
  private plCsvMonthLabelEs(monthKey: string): string {
    const d = new Date(`${monthKey}-01T12:00:00Z`);
    if (Number.isNaN(d.getTime())) return monthKey;
    return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }

  /**
   * Resumen P&L en CSV: mismo período que la consulta, columnas por mes del rango,
   * catálogo completo (incluye cuentas en cero) y totales al pie.
   */
  async profitAndLossCsv(user: PanelUser, fromDate: string, toDate: string): Promise<string> {
    const core = await this.computeProfitAndLossCore(user, fromDate, toDate);
    const catalog = await this.accountCatalogRepo.find({
      order: { orderIndex: 'ASC', code: 'ASC' },
    });
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const fmt = (n: number) => (n === 0 ? '-' : n.toFixed(2));
    const monthKeys = core.monthKeys;
    const emptyMonthCells = monthKeys.map(() => '');

    const amountBy = new Map<string, number>();
    const monthlyBy = new Map<string, number[]>();
    for (const sec of core.sections) {
      for (const g of sec.groups) {
        for (const line of g.lines) {
          const code = String(line.accountCode || '').toUpperCase().trim();
          if (!code) continue;
          amountBy.set(code, Number(line.amount || 0));
          monthlyBy.set(
            code,
            (line.monthlyAmounts || monthKeys.map(() => 0)).map((x) => Number(x || 0)),
          );
        }
      }
    }
    for (const line of core.intercompanyLines) {
      const code = String(line.accountCode || '').toUpperCase().trim();
      if (!code) continue;
      amountBy.set(code, Number(line.amount || 0));
      monthlyBy.set(code, monthKeys.map(() => 0));
    }

    const monthHeaders = monthKeys.map((mk) => esc(this.plCsvMonthLabelEs(mk)));
    const rows: string[] = [];
    rows.push(['Sección', 'Grupo', 'Código cuenta', 'Cuenta', ...monthHeaders, 'Total'].join(','));
    rows.push(['#', esc(`Período ${fromDate} - ${toDate}`), '', '', ...emptyMonthCells, ''].join(','));
    rows.push(['#', esc('Base contable (cash); INTERCO excluido de totales operativos'), '', '', ...emptyMonthCells, ''].join(','));

    const seenCatalogCodes = new Set<string>();
    for (const c of catalog) {
      const code = c.code.toUpperCase().trim();
      seenCatalogCodes.add(code);
      const amount = amountBy.get(code) ?? 0;
      const monthly = monthlyBy.get(code) ?? monthKeys.map(() => 0);
      const monthCols = monthKeys.map((_, i) => fmt(monthly[i] ?? 0));
      rows.push([esc(c.plSection || '—'), esc(c.plGroup || '—'), code, esc(c.name), ...monthCols, fmt(amount)].join(','));
    }

    for (const sec of core.sections) {
      for (const g of sec.groups) {
        for (const line of g.lines) {
          const code = String(line.accountCode || '').toUpperCase().trim();
          if (!code || seenCatalogCodes.has(code)) continue;
          const monthly = monthlyBy.get(code) ?? monthKeys.map(() => 0);
          const monthCols = monthKeys.map((_, i) => fmt(monthly[i] ?? 0));
          rows.push(
            [esc(sec.section), esc(g.group), code, esc(line.label), ...monthCols, fmt(Number(line.amount || 0))].join(','),
          );
        }
      }
    }

    rows.push(['', '', '', esc('Total ingresos (operativo)'), ...emptyMonthCells, core.totalIncome.toFixed(2)].join(','));
    rows.push(['', '', '', esc('Total gastos (operativo)'), ...emptyMonthCells, core.totalExpense.toFixed(2)].join(','));
    rows.push(['', '', '', esc('Resultado neto (operativo)'), ...emptyMonthCells, core.netIncome.toFixed(2)].join(','));
    rows.push(['', '', '', esc('Margen %'), ...emptyMonthCells, String(core.marginPct)].join(','));
    if (core.intercompanyLines.length) {
      rows.push([esc('Intercompany'), '', '', '', ...emptyMonthCells, ''].join(','));
      for (const line of core.intercompanyLines) {
        const code = String(line.accountCode || '').toUpperCase().trim();
        rows.push(['', '', code, esc(line.label), ...emptyMonthCells, String(line.amount)].join(','));
      }
      rows.push(['', '', '', esc('Total intercompany'), ...emptyMonthCells, String(core.intercompanyTotal)].join(','));
    }

    return '\uFEFF' + rows.join('\n') + '\n';
  }

  /** Detalle por movimiento (exportación auxiliar). */
  async profitAndLossTransactionsCsv(user: PanelUser, fromDate: string, toDate: string): Promise<string> {
    await this.ensureDefaultAccountCatalog();
    const catalogRows = await this.accountCatalogRepo.find();
    const catalogByCode = new Map(catalogRows.map((c) => [c.code.toUpperCase(), c.name]));
    const rows = await this.plEligibleQuery(user, fromDate, toDate)
      .orderBy('tx.account_code', 'ASC')
      .addOrderBy('COALESCE(tx.accounting_date, tx.tx_date)', 'ASC')
      .addOrderBy('tx.id', 'ASC')
      .getMany();
    const header = 'Fecha contable,Descripción,Código cuenta,Nombre cuenta,Monto\n';
    const body = rows
      .map((r) => {
        const fd = r.accountingDate || r.txDate;
        const code = (r.accountCode || '').trim();
        const label =
          catalogByCode.get(code.toUpperCase()) ?? this.labelForAccount(this.accountPrefix(code));
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
