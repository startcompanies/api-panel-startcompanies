import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CanonicalTx } from './accounting-canonical.types';
import type { AccountCatalog } from './entities/account-catalog.entity';
import type { UserClassificationRule } from './entities/user-classification-rule.entity';
import { AccountingAiSuggestService } from './accounting-ai-suggest.service';
import { resolveRuleCodeInCatalog } from './accounting-catalog-bridge';

export type ClassificationLayerSource = 'exact' | 'fuzzy' | 'ai';

export type LayerClassificationResult = {
  accountCode: string | null;
  confidence: number;
  source: ClassificationLayerSource;
  /** Si true, sugerimos cuenta pero pedimos revisión (p. ej. INTERCO). */
  needsReview: boolean;
  label?: string | null;
  /** Status HTTP de IA cuando aplica (p.ej. 429 cuota). */
  aiErrorStatus?: number;
};

export const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.8;

function normalizeSourceBankFilter(s: string | null | undefined): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function catalogAllowedSet(rows: AccountCatalog[]): Set<string> {
  return new Set(rows.filter((r) => r.active).map((r) => r.code.toUpperCase()));
}

function labelsFromCatalog(rows: AccountCatalog[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) {
    if (r.active) o[r.code.toUpperCase()] = r.name;
  }
  return o;
}

/**
 * Reglas exactas de sistema: payee normalizado → cuenta catálogo.
 * Se evalúan DESPUÉS de user rules y ANTES de fuzzy regex.
 * Usan match exacto contra tx.payeeNormalized (lowercase, trimmed).
 */
const SYSTEM_EXACT_RULES: {
  payeeKey: string;
  code: string;
  incomeOnly?: boolean;
  expenseOnly?: boolean;
}[] = [
  // Pasarelas de cobro — ingresos
  { payeeKey: 'stripe',                   code: 'SALES',              incomeOnly: true },
  { payeeKey: 'paypal',                   code: 'SALES',              incomeOnly: true },
  { payeeKey: 'square',                   code: 'SALES',              incomeOnly: true },
  { payeeKey: 'shopify payments',         code: 'SALES',              incomeOnly: true },
  { payeeKey: 'braintree',                code: 'SALES',              incomeOnly: true },
  // Wise como intermediario de pago de clientes
  { payeeKey: 'wise us inc',              code: 'SALES',              incomeOnly: true },
  { payeeKey: 'wise us inc.',             code: 'SALES',              incomeOnly: true },
  { payeeKey: 'wise inc',                 code: 'SALES',              incomeOnly: true },
  { payeeKey: 'wise',                     code: 'SALES',              incomeOnly: true },
  // Comisiones de pasarelas — gastos
  { payeeKey: 'stripe',                   code: 'FINANCE/CARD_FEES',  expenseOnly: true },
  { payeeKey: 'paypal',                   code: 'FINANCE/CARD_FEES',  expenseOnly: true },
  // Banca digital
  { payeeKey: 'mercury credit',           code: 'FINANCE/CARD_FEES',  expenseOnly: true },
  { payeeKey: 'mercury io cashback',      code: 'INVEST/INTEREST',    incomeOnly: true },
  { payeeKey: 'relay financial us corp',  code: 'OTHER_INCOME',       incomeOnly: true },
  // SaaS universales
  { payeeKey: 'openai',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'anthropic',               code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'github',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'notion',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'slack',                    code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'zoom',                     code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'dropbox',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'figma',                    code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'loom',                     code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'linear',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'vercel',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'supabase',                 code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'netlify',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'digitalocean',             code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'heroku',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'shopify',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'quickbooks',               code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'xero',                     code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'hubspot',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'highlevel',                code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'mailchimp',                code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'klaviyo',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'airtable',                 code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'intercom',                 code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'zendesk',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'twilio',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'sendgrid',                 code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'datadog',                  code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'sentry',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: '1password',                code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'lastpass',                 code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'gsuite',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'google workspace',         code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'microsoft 365',            code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'adobe',                    code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'canva',                    code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'zapier',                   code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  { payeeKey: 'make',                     code: 'ADMIN/SOFTWARES',    expenseOnly: true },
  // Cloud / infra
  { payeeKey: 'amazon web services',      code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'aws',                      code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'google cloud',             code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'microsoft azure',          code: 'UTILITIES/INTERNET', expenseOnly: true },
  // Telecom
  { payeeKey: 't-mobile',                 code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'at&t',                     code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'verizon',                  code: 'UTILITIES/INTERNET', expenseOnly: true },
  { payeeKey: 'comcast',                  code: 'UTILITIES/INTERNET', expenseOnly: true },
  // Publicidad
  { payeeKey: 'google',                   code: 'MKT',                expenseOnly: true },
  { payeeKey: 'facebook',                 code: 'MKT',                expenseOnly: true },
  { payeeKey: 'meta',                     code: 'MKT',                expenseOnly: true },
  { payeeKey: 'tiktok',                   code: 'MKT',                expenseOnly: true },
  { payeeKey: 'linkedin',                 code: 'MKT',                expenseOnly: true },
  { payeeKey: 'twitter',                  code: 'MKT',                expenseOnly: true },
  // Seguros
  { payeeKey: 'hiscox',                   code: 'INSURANCE',          expenseOnly: true },
  { payeeKey: 'next insurance',           code: 'INSURANCE',          expenseOnly: true },
  { payeeKey: 'nationwide',               code: 'INSURANCE',          expenseOnly: true },
  // Viajes
  { payeeKey: 'airbnb',                   code: 'TRAVEL',             expenseOnly: true },
  { payeeKey: 'uber',                     code: 'TRAVEL',             expenseOnly: true },
  { payeeKey: 'lyft',                     code: 'TRAVEL',             expenseOnly: true },
  { payeeKey: 'expedia',                  code: 'TRAVEL',             expenseOnly: true },
  { payeeKey: 'booking.com',              code: 'TRAVEL',             expenseOnly: true },
  // Entretenimiento / no operativo
  { payeeKey: 'amazon prime video',       code: 'MEALS/ENT' },
  { payeeKey: 'netflix',                  code: 'MEALS/ENT' },
  { payeeKey: 'spotify',                  code: 'MEALS/ENT' },
];

/** Reglas difusas sobre texto → código catálogo y confianza. */
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
  // SaaS genéricos adicionales
  { re: /highlevel|high.?level/i,                                        code: 'ADMIN/SOFTWARES',    confidence: 0.87, expenseOnly: true },
  { re: /vercel|netlify|render\.com/i,                                   code: 'ADMIN/SOFTWARES',    confidence: 0.87, expenseOnly: true },
  { re: /openai|open.?ai|anthropic|cohere/i,                             code: 'ADMIN/SOFTWARES',    confidence: 0.87, expenseOnly: true },
  { re: /supabase|planetscale|neon\.tech/i,                              code: 'ADMIN/SOFTWARES',    confidence: 0.87, expenseOnly: true },
  { re: /zoho|zoho\*/i,                                                  code: 'ADMIN/SOFTWARES',    confidence: 0.85, expenseOnly: true },
  { re: /fathom|loom\.com|descript/i,                                    code: 'ADMIN/SOFTWARES',    confidence: 0.85, expenseOnly: true },
  { re: /make\.com|zapier|n8n/i,                                         code: 'ADMIN/SOFTWARES',    confidence: 0.85, expenseOnly: true },
  // Telecom
  { re: /t-?mobile|tmobile|at&t|verizon|comcast/i,                      code: 'UTILITIES/INTERNET', confidence: 0.88, expenseOnly: true },
  // Legal / cumplimiento / gobierno
  { re: /secretary of state|sos\b|nm public|registered agent/i,          code: 'PAYROLL',            confidence: 0.85, expenseOnly: true },
  { re: /corporate filing|annual report|llc formation|incorporate/i,     code: 'PAYROLL',            confidence: 0.85, expenseOnly: true },
  { re: /attorney|lawyer|legal fee|notary|notario/i,                     code: 'PAYROLL',            confidence: 0.84, expenseOnly: true },
  // Marketing de performance
  { re: /commission|comisi[oó]n/i,                                       code: 'MKT',                confidence: 0.80, expenseOnly: true },
  { re: /affiliate|afiliado|impact radius/i,                             code: 'MKT',                confidence: 0.83, expenseOnly: true },
  // Ingresos
  { re: /\brevenue\b/i,                                                  code: 'SALES',              confidence: 0.83, incomeOnly: true },
  { re: /renovaci[oó]n|renewal|llc service|llc renewal/i,               code: 'SALES',              confidence: 0.78, incomeOnly: true },
  { re: /partner payout|payout program|referral payout/i,               code: 'OTHER_INCOME',       confidence: 0.84, incomeOnly: true },
  // Banca
  { re: /io autopay|autopay|auto.?pay/i,                                 code: 'FINANCE/CARD_FEES',  confidence: 0.85, expenseOnly: true },
  { re: /government.?services|government fee/i,                          code: 'PAYROLL',            confidence: 0.82, expenseOnly: true },
  { re: /legal.*professional|professional.*services/i,                   code: 'PAYROLL',            confidence: 0.82, expenseOnly: true },
];

@Injectable()
export class AccountingClassificationService {
  constructor(
    private readonly config: ConfigService,
    private readonly aiSuggest: AccountingAiSuggestService,
  ) {}

  intercoKeywords(): string[] {
    const raw =
      this.config.get<string>('ACCOUNTING_INTERCO_KEYWORDS') ||
      'intercompany,interco,ic transfer,ic settlement,subsidiary holding,parent company';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  matchesInterco(text: string, keywords: string[]): boolean {
    const t = (text || '').toLowerCase();
    return keywords.some((k) => k && t.includes(k.toLowerCase()));
  }

  /** Capas A/B/C (+ INTERCO) sin IA. Orden: INTERCO → user rules → system exact → fuzzy → safety net. */
  classifyDeterministic(
    tx: CanonicalTx,
    catalog: AccountCatalog[],
    userRules: UserClassificationRule[],
  ): LayerClassificationResult | null {
    const allowed = catalogAllowedSet(catalog);
    const labels = labelsFromCatalog(catalog);
    // haystack se reutiliza en todos los loops: INTERCO, fuzzy regex y safety net
    const haystack = `${tx.description} ${tx.payeeNormalized}`.toLowerCase();

    // 1. INTERCO — prioridad absoluta
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

    // 2. Reglas explícitas del usuario — confianza máxima
    for (const rule of userRules) {
      if (!rule.active) continue;
      if (rule.payeeKey !== tx.payeeNormalized) continue;
      if (rule.sourceFilter) {
        const rf = normalizeSourceBankFilter(rule.sourceFilter);
        if (rf && rf !== srcKey) continue;
      }
      const resolved = resolveRuleCodeInCatalog(rule.accountCode, allowed, labels);
      if (!resolved) continue;
      return {
        accountCode: resolved.code,
        confidence: 1,
        source: 'exact',
        needsReview: false,
        label: resolved.label,
      };
    }

    // 3. Reglas exactas de sistema (payee normalizado, universales)
    for (const sr of SYSTEM_EXACT_RULES) {
      if (sr.payeeKey !== tx.payeeNormalized) continue;
      if (sr.incomeOnly && !tx.isIncome) continue;
      if (sr.expenseOnly && tx.isIncome) continue;
      const resolved = resolveRuleCodeInCatalog(sr.code, allowed, labels);
      if (!resolved) continue;
      return {
        accountCode: resolved.code,
        confidence: 0.92,
        source: 'fuzzy',
        needsReview: false,
        label: resolved.label,
      };
    }

    // 4. Reglas difusas — haystack incluye description + payeeNormalized (Fix 1)
    for (const fr of FUZZY_CATALOG_RULES) {
      if (fr.incomeOnly && !tx.isIncome) continue;
      if (fr.expenseOnly && tx.isIncome) continue;
      if (!fr.re.test(haystack)) continue;
      const resolved = resolveRuleCodeInCatalog(fr.code, allowed, labels);
      if (!resolved) continue;
      return {
        accountCode: resolved.code,
        confidence: fr.confidence,
        source: 'fuzzy',
        needsReview: false,
        label: resolved.label,
      };
    }

    // 5. Red de seguridad: ingreso sin clasificar → ingresos por servicios provisional
    if (tx.isIncome) {
      const resolved = resolveRuleCodeInCatalog('SALES', allowed, labels);
      if (resolved) {
        return {
          accountCode: resolved.code,
          confidence: 0.65,
          source: 'fuzzy',
          needsReview: true,
          label: resolved.label,
        };
      }
    }

    return null;
  }

  async classifyWithAi(
    tx: CanonicalTx,
    catalog: AccountCatalog[],
    apiKey: string,
  ): Promise<LayerClassificationResult | null> {
    const allowedList = catalog.filter((r) => r.active);
    if (!allowedList.length) return null;
    const allowedSet = catalogAllowedSet(catalog);
    const labels = labelsFromCatalog(catalog);
    const ai = await this.aiSuggest.suggestAccountCodeFromCatalog(
      tx.description || '',
      allowedList.map((r) => r.code.toUpperCase()),
      labels,
      apiKey,
      {
        amountUsd: tx.amount,
        payeeHint: tx.payeeNormalized,
        isIncome: tx.isIncome,
        txDate: tx.date,
        txSource: tx.source,
      },
    );
    if (!ai.accountCode || !allowedSet.has(ai.accountCode)) {
      if (ai.errorStatus || ai.errorMessage) {
        return {
          accountCode: null,
          confidence: 0,
          source: 'ai',
          needsReview: true,
          label: null,
          aiErrorStatus: ai.errorStatus ?? 422,
        };
      }
      return null;
    }
    const confidence = ai.confidence ?? 0.75;
    return {
      accountCode: ai.accountCode,
      confidence,
      source: 'ai',
      needsReview: false,
      label: ai.label ?? labels[ai.accountCode] ?? ai.accountCode,
    };
  }

  /**
   * INTERCO → reglas usuario → difuso → IA si no hay confianza ≥ umbral.
   */
  async classifyFull(params: {
    tx: CanonicalTx;
    catalog: AccountCatalog[];
    userRules: UserClassificationRule[];
    ai?: { apiKey: string } | null;
  }): Promise<LayerClassificationResult> {
    const det = this.classifyDeterministic(params.tx, params.catalog, params.userRules);

    if (det?.accountCode === 'INTERCO') {
      return det;
    }
    if (det && det.confidence >= CLASSIFICATION_CONFIDENCE_THRESHOLD) {
      return det;
    }

    if (params.ai) {
      const aiRes = await this.classifyWithAi(params.tx, params.catalog, params.ai.apiKey);
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
}
