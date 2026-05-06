# Accounting Module Reference

This document captures the exact code blocks requested from the accounting module.

## 1) Transaction normalizer (CSV row -> canonical tx)

Path: `src/panel/accounting/accounting-canonical.types.ts`

```ts
/** Fuente de ingesta tras normalizar cabeceras CSV. */
export type CanonicalTxSource =
  | 'relay'
  | 'mercury'
  | 'quickbooks'
  | 'netsuite'
  | 'generic';

/** Modelo único previo a clasificar (motor A/B/C). */
export type CanonicalTx = {
  date: string;
  amount: number;
  isIncome: boolean;
  description: string;
  payeeNormalized: string;
  source: CanonicalTxSource;
};

export function normalizePayeeKey(text: string | null | undefined): string {
  return String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 255);
}
```

Path: `src/panel/accounting/accounting-csv.util.ts`

```ts
export function bankRowToCanonical(row: ParsedBankRow): CanonicalTx {
  const amt = Number(row.amount);
  return {
    date: row.txDate,
    amount: amt,
    isIncome: amt > 0,
    description: row.description || '',
    payeeNormalized: row.payeeNormalized || normalizePayeeKey(row.description),
    source: bankDisplayNameToCanonicalSource(row.bank),
  };
}
```

```ts
export function normalizeBankRow(
  row: Record<string, string>,
  headers: string[],
  bank: string,
): ParsedBankRow | null {
  const dateStr = findVal(row, headers, [
    'date',
    'fecha',
    'transaction date',
    'posted date',
    'posting date',
    'value date',
    'completed date',
    'trn date',
  ]);

  let descStr = findVal(row, headers, [
    'description',
    'memo',
    'narration',
    'details',
    'payee',
    'name',
    'reference',
    'merchant',
  ]);

  const payeeOnly = findVal(row, headers, [
    'payee',
    'payer/payee',
    'payer/payee name',
    'merchant',
    'name',
    'customer',
    'vendor',
    'entity',
  ]);

  if (bank === 'QuickBooks') {
    const qbMemo = findVal(row, headers, ['memo', 'memo/description', 'description', 'notes']);
    const qbNum = findVal(row, headers, ['num', 'no.', 'no', 'reference no', 'doc number']);
    const parts = [payeeOnly, qbMemo, qbNum].filter((p) => p && !/^unknown$/i.test(p));
    if (parts.length) descStr = parts.join(' · ');
  }

  const dTrim = (descStr || '').trim();
  if ((!dTrim || /^unknown$/i.test(dTrim)) && payeeOnly) {
    descStr = payeeOnly;
  }

  let amt = 0;
  const amtStr = findVal(row, headers, ['amount', 'amt', 'value', 'monto', 'importe', 'total']);
  const debitStr = findVal(row, headers, ['debit', 'debit amount', 'withdrawal', 'payment']);
  const creditStr = findVal(row, headers, ['credit', 'credit amount', 'deposit']);

  if (bank === 'NetSuite' && (debitStr || creditStr)) {
    const d = parseFloat(String(debitStr).replace(/[^0-9.-]/g, '')) || 0;
    const c = parseFloat(String(creditStr).replace(/[^0-9.-]/g, '')) || 0;
    if (c && !d) amt = Math.abs(c);
    else if (d && !c) amt = -Math.abs(d);
    else amt = c - d;
  } else if (debitStr && creditStr && !amtStr) {
    const d = parseFloat(debitStr.replace(/[^0-9.]/g, '')) || 0;
    const c = parseFloat(creditStr.replace(/[^0-9.]/g, '')) || 0;
    amt = c > 0 ? c : -d;
  } else {
    amt = parseFloat((amtStr || '').replace(/[^0-9.-]/g, '')) || 0;
  }

  const nsType = findVal(row, headers, ['type', 'transaction type', 'tran type']).toUpperCase();
  if (bank === 'NetSuite' && amt > 0 && /DEBIT|BILL|PAYMENT|CHECK|EXPENSE|TRANSFER OUT/i.test(nsType)) {
    amt = -Math.abs(amt);
  }
  if (bank === 'NetSuite' && amt < 0 && /CREDIT|DEPOSIT|INFLOW/i.test(nsType)) {
    amt = Math.abs(amt);
  }

  const fechaRaw = (dateStr.split(' ')[0] || dateStr || '').trim();
  const iso = fechaRaw ? normalizeCsvDateToIso(fechaRaw) : new Date().toISOString().split('T')[0];
  const desc = descStr || 'Sin descripción';

  const payeeForKey =
    payeeOnly && !/^unknown$/i.test(payeeOnly.trim())
      ? payeeOnly
      : (desc.split(/[·|]/)[0] || desc).trim();
  const payeeNormalized = normalizePayeeKey(payeeForKey) || normalizePayeeKey(desc);

  if (desc === 'Sin descripción' && amt === 0) return null;
  return { txDate: iso, description: desc, amount: amt, bank, payeeNormalized };
}
```

```ts
export function parseBankCsvText(csv: string, fileName?: string): {
  detectedBank: string;
  rows: ParsedBankRow[];
  totalRows: number;
} {
  const lines = (csv || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return { detectedBank: 'Genérico', rows: [], totalRows: 0 };
  }
  const headers = parseDelimitedLine(lines[0]).map((h) => h.replace(/"/g, '').trim());
  const detectedBank = detectBankFromFileNameAndHeaders(fileName || '', headers);
  const rows: ParsedBankRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const vals = parseDelimitedLine(lines[i]);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, j) => {
      rowObj[h] = vals[j] !== undefined ? vals[j].replace(/"/g, '').trim() : '';
    });
    const mov = normalizeBankRow(rowObj, headers, detectedBank);
    if (mov) rows.push(mov);
  }
  return { detectedBank, rows, totalRows: lines.length - 1 };
}
```

## 2) Categorization engine (exact, fuzzy, historical fallback, threshold)

Path: `src/panel/accounting/accounting-classification.service.ts`

```ts
export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8;
```

```ts
classifyDeterministic(
  tx: CanonicalTx,
  catalog: AccountCatalog[],
  userRules: UserClassificationRule[],
): LayerClassificationResult | null {
  const allowed = catalogAllowedSet(catalog);
  const labels = labelsFromCatalog(catalog);
  const haystack = `${tx.description} ${tx.payeeNormalized}`.toLowerCase();

  if (this.matchesInterco(haystack, this.intercoKeywords()) && allowed.has('INTERCO')) {
    return {
      accountCode: 'INTERCO',
      confidence: 0.95,
      source: 'exact',
      needsReview: true,
      label: labels.INTERCO ?? 'INTERCO',
    };
  }

  const srcKey = normalizeSourceBankFilter(
    tx.source === 'quickbooks'
      ? 'quickbooks'
      : tx.source === 'netsuite'
        ? 'netsuite'
        : tx.source,
  );

  for (const rule of userRules) {
    if (!rule.active) continue;
    if (rule.payeeKey !== tx.payeeNormalized) continue;
    if (rule.sourceFilter) {
      const rf = normalizeSourceBankFilter(rule.sourceFilter);
      if (rf && rf !== srcKey) continue;
    }
    const code = rule.accountCode.toUpperCase();
    if (!allowed.has(code)) continue;
    return {
      accountCode: code,
      confidence: 1,
      source: 'exact',
      needsReview: false,
      label: labels[code] ?? code,
    };
  }

  const descLower = (tx.description || '').toLowerCase();
  for (const fr of FUZZY_CATALOG_RULES) {
    if (fr.incomeOnly && !tx.isIncome) continue;
    if (fr.expenseOnly && tx.isIncome) continue;
    if (!fr.re.test(descLower)) continue;
    const code = fr.code.toUpperCase();
    if (!allowed.has(code)) continue;
    return {
      accountCode: code,
      confidence: fr.confidence,
      source: 'fuzzy',
      needsReview: false,
      label: labels[code] ?? code,
    };
  }

  return null;
}
```

```ts
async classifyFull(params: {
  tx: CanonicalTx;
  catalog: AccountCatalog[];
  userRules: UserClassificationRule[];
  ai?: { provider: AiSuggestSource; apiKey: string } | null;
}): Promise<LayerClassificationResult> {
  const det = this.classifyDeterministic(params.tx, params.catalog, params.userRules);

  if (det?.accountCode === 'INTERCO') {
    return det;
  }
  if (det && det.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD) {
    return det;
  }

  if (params.ai) {
    const aiRes = await this.classifyWithAi(
      params.tx,
      params.catalog,
      params.ai.provider,
      params.ai.apiKey,
    );
    if (aiRes?.aiErrorStatus) {
      return aiRes;
    }
    if (aiRes && aiRes.accountCode && aiRes.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      return { ...aiRes, needsReview: false };
    }
    if (aiRes?.accountCode) {
      return { ...aiRes, needsReview: true };
    }
  }

  if (det) {
    return { ...det, needsReview: true };
  }

  return {
    accountCode: null,
    confidence: 0,
    source: 'fuzzy',
    needsReview: true,
    label: null,
  };
}
```

Path: `src/panel/accounting/accounting.service.ts`

```ts
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
```

```ts
async bulkApplySuggestedCategories(
  user: PanelUser,
  opts?: { useAi?: boolean },
): Promise<{
  updatedRules: number;
  updatedAi: number;
  skippedRules: number;
  skippedAi: number;
  remainingUncategorized: number;
  aiQuotaExceeded?: boolean;
  aiErrorStatus?: number;
  aiStoppedEarly?: boolean;
}> {
  await this.ensureExtendedCategoryPlan();
  await this.ensureDefaultAccountCatalog();
  const useAi = opts?.useAi !== false;
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

  const cred = useAi ? await this.userAiCredentials.getDecryptedForUser(user.id) : null;
  const ai =
    cred && (cred.provider === 'anthropic' || cred.provider === 'openai')
      ? { provider: cred.provider, apiKey: cred.apiKey }
      : null;
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

    const persist =
      !!res.accountCode &&
      (res.accountCode === 'INTERCO' ||
        (!res.needsReview && res.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD));

    if (!persist) {
      tx.needsReview = true;
      await this.txRepo.save(tx);
      if (res.source === 'ai') skippedAi += 1;
      else skippedRules += 1;
      continue;
    }

    tx.accountCode = res.accountCode;
    tx.categoryId = await this.resolveCategoryIdForAccountCode(res.accountCode);
    tx.accountingDate = tx.accountingDate || tx.txDate;
    tx.classificationSource = res.source;
    tx.classificationConfidence = Number(res.confidence.toFixed(4));
    tx.needsReview = res.needsReview;
    await this.txRepo.save(tx);
    if (res.source === 'ai') updatedAi += 1;
    else updatedRules += 1;
  }

  const remainingUncategorized = (await this.listTransactions(user, { uncategorized: true })).length;
  return {
    updatedRules,
    updatedAi,
    skippedRules,
    skippedAi,
    remainingUncategorized,
    ...(aiErrorStatus ? { aiErrorStatus } : {}),
    ...(aiQuotaExceeded ? { aiQuotaExceeded } : {}),
    ...(aiStoppedEarly ? { aiStoppedEarly } : {}),
  };
}
```

## 3) `user_classification_rules` structure (schema + queries)

Path: `src/panel/accounting/entities/user-classification-rule.entity.ts`

```ts
@Entity('user_classification_rules')
export class UserClassificationRule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'owner_user_id', type: 'int' })
  ownerUserId: number;

  @Column({ name: 'payee_key', type: 'varchar', length: 255 })
  payeeKey: string;

  @Column({ name: 'account_code', type: 'varchar', length: 64 })
  accountCode: string;

  @Column({ name: 'source_filter', type: 'varchar', length: 64, nullable: true })
  sourceFilter: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_from_tx_id', type: 'int', nullable: true })
  createdFromTxId: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;
}
```

Path: `src/migrations/1775500000000-BankTxClassificationAndUserRules.ts`

```ts
await queryRunner.query(`
  CREATE TABLE IF NOT EXISTS user_classification_rules (
    id SERIAL PRIMARY KEY,
    owner_user_id INT NOT NULL,
    payee_key VARCHAR(255) NOT NULL,
    account_code VARCHAR(64) NOT NULL,
    source_filter VARCHAR(64) NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_from_tx_id INT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
`);
await queryRunner.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_user_classification_rules_owner_payee_source
  ON user_classification_rules (owner_user_id, payee_key, (COALESCE(source_filter, '')));
`);
```

Path: `src/panel/accounting/accounting.service.ts`

```ts
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
```

```ts
const explicitRules = await this.rulesRepo.find({ where: { ownerUserId: oid, active: true } });
```

```ts
const rules = await this.rulesRepo.find({ where: { ownerUserId: user.id, active: true } });
```

## 4) Fuzzy matching logic (which fields are used)

Path: `src/panel/accounting/accounting-classification.service.ts`

```ts
const haystack = `${tx.description} ${tx.payeeNormalized}`.toLowerCase();

if (this.matchesInterco(haystack, this.intercoKeywords()) && allowed.has('INTERCO')) {
  // ...
}
```

```ts
const descLower = (tx.description || '').toLowerCase();
for (const fr of FUZZY_CATALOG_RULES) {
  if (fr.incomeOnly && !tx.isIncome) continue;
  if (fr.expenseOnly && tx.isIncome) continue;
  if (!fr.re.test(descLower)) continue;
  // ...
}
```

## 5) System rules table (hardcoded keyword -> account_code)

Path: `src/panel/accounting/accounting-classification.service.ts`

```ts
const FUZZY_CATALOG_RULES: {
  re: RegExp;
  code: string;
  confidence: number;
  incomeOnly?: boolean;
  expenseOnly?: boolean;
}[] = [
  { re: /gusto|payroll|paylocity|adp|salary|nomina|contratista/i, code: 'PAYROLL', confidence: 0.88 },
  {
    re: /aws|amazon web|gcp|google cloud|azure|digitalocean|linode|vultr|heroku/i,
    code: 'UTILITIES/INTERNET',
    confidence: 0.86,
    expenseOnly: true,
  },
  {
    re: /stripe fee|braintree|square fee|paypal fee|transaction fee|processing fee|card fee/i,
    code: 'FINANCE/CARD_FEES',
    confidence: 0.87,
    expenseOnly: true,
  },
  {
    re: /facebook ads|google ads|meta ads|tiktok ads|hubspot|mailchimp|klaviyo|semrush/i,
    code: 'MKT',
    confidence: 0.86,
    expenseOnly: true,
  },
  {
    re: /lawyer|attorney|legal|accountant|contador|cpa|notary/i,
    code: 'PAYROLL',
    confidence: 0.82,
    expenseOnly: true,
  },
  {
    re: /airbnb|hotel|marriott|hilton|flight|united airlines|american air|delta|uber|lyft|taxi/i,
    code: 'TRAVEL',
    confidence: 0.85,
    expenseOnly: true,
  },
  {
    re: /bank fee|monthly fee|wire fee|swift fee|maintenance fee|annual fee/i,
    code: 'FINANCE/CARD_FEES',
    confidence: 0.84,
    expenseOnly: true,
  },
  {
    re: /slack|notion|figma|zoom|loom|dropbox|shopify|quickbooks|xero/i,
    code: 'ADMIN/SOFTWARES',
    confidence: 0.85,
    expenseOnly: true,
  },
  {
    re: /invoice|payment received|client payment|transfer in|deposit|ingreso|cobro/i,
    code: 'SALES',
    confidence: 0.82,
    incomeOnly: true,
  },
  {
    re: /interest|dividend|cashback|rewards|referral/i,
    code: 'OTHER_INCOME',
    confidence: 0.8,
    incomeOnly: true,
  },
  { re: /electric|utilities|power company/i, code: 'UTILITIES/ELECTRICITY', confidence: 0.83, expenseOnly: true },
  { re: /rent|lease|landlord/i, code: 'RENT', confidence: 0.84, expenseOnly: true },
];
```
