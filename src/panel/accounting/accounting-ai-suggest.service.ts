import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  ACCOUNT_CHART_CODES,
  ACCOUNT_CHART_LABELS,
  isAllowedAccountCode,
} from './accounting-chart.constants';

export type AiSuggestSource = 'gemini';

export type AiSuggestResult = {
  accountCode: string | null;
  label: string | null;
  source: AiSuggestSource;
  errorStatus?: number;
  errorMessage?: string;
};

export type AiSuggestContext = {
  amountUsd?: number;
  payeeHint?: string;
  isIncome?: boolean;
  txDate?: string;
  txSource?: string;
};

export type AiCatalogSuggestResult = {
  accountCode: string | null;
  label: string | null;
  source: AiSuggestSource;
  confidence: number;
  errorStatus?: number;
  errorMessage?: string;
};

function buildCatalogPrompt(
  description: string,
  codes: string[],
  labels: Record<string, string>,
  ctx?: AiSuggestContext,
): string {
  const catalogList = codes.map((c) => `- ${c}: ${labels[c] || c}`).join('\n');
  const monto =
    ctx?.amountUsd !== undefined && Number.isFinite(ctx.amountUsd)
      ? String(Math.abs(ctx.amountUsd))
      : 'N/A';
  const tipo = ctx?.isIncome !== undefined ? (ctx.isIncome ? 'INGRESO' : 'EGRESO') : 'N/A';
  const payee = ctx?.payeeHint?.trim().slice(0, 200) || description.slice(0, 100);
  const fecha = ctx?.txDate || 'N/A';
  const fuente = ctx?.txSource || 'N/A';

  return `Eres un contador experto. Clasifica la siguiente transacción bancaria en UNA de las cuentas del catálogo proporcionado.

CATÁLOGO DE CUENTAS DISPONIBLES:
${catalogList}

TRANSACCIÓN A CLASIFICAR:
- Fecha: ${fecha}
- Monto: ${monto} USD
- Tipo: ${tipo}
- Payee/Beneficiario: ${payee}
- Descripción completa: ${description.slice(0, 800)}
- Fuente: ${fuente}

INSTRUCCIONES:
1. Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código markdown.
2. El campo account_code debe ser exactamente uno de los códigos del catálogo.
3. El campo confidence debe reflejar tu certeza real (0.0 a 1.0). Si no tienes suficiente contexto, usa 0.60-0.70.
4. El campo reason debe ser máximo 15 palabras en español.
5. Si el monto es un INGRESO y el payee parece ser un cliente o intermediario de pago (Wise, PayPal, Stripe, etc.), clasifica como SALES salvo evidencia contraria.
6. Si no hay suficiente contexto para decidir, usa UNCAT con confidence 0.40.

FORMATO DE RESPUESTA (solo esto, nada más):
{"account_code": "CODIGO", "confidence": 0.00, "reason": "explicación breve"}`;
}

function parseCatalogModelJson(
  text: string,
  allowed: Set<string>,
): { accountCode?: string; confidence: number } {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const body = fence ? fence[1].trim() : t;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    const m = body.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('No JSON object');
    parsed = JSON.parse(m[0]);
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { confidence: 0 };
  }
  const o = parsed as Record<string, unknown>;
  const raw = o.accountCode ?? o.account_code ?? o.code ?? o.AccountCode;
  let code = String(raw ?? '').trim().toUpperCase();
  if (!allowed.has(code)) {
    const hit = [...allowed].find((c) => c.toUpperCase() === code);
    if (hit) code = hit;
  }
  const accountCode = allowed.has(code) ? code : undefined;
  let confidence = 0.65;
  const cr = o.confidence;
  if (typeof cr === 'number' && Number.isFinite(cr)) confidence = cr;
  else if (typeof cr === 'string') confidence = parseFloat(cr) || confidence;
  return { accountCode, confidence };
}

function extractGeminiError(e: unknown): { status?: number; message: string } {
  const err = e as { message?: string; status?: number; statusText?: string };
  const message = String(err?.message || err?.statusText || e || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return { status: err?.status, message: message || 'Error del proveedor Gemini.' };
}

@Injectable()
export class AccountingAiSuggestService {
  private readonly log = new Logger(AccountingAiSuggestService.name);

  constructor(private readonly config: ConfigService) {}

  geminiModel(): string {
    return this.config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash';
  }

  async suggestAccountCodeFromCatalog(
    description: string,
    catalogCodes: string[],
    labels: Record<string, string>,
    apiKey: string,
    ctx?: AiSuggestContext,
  ): Promise<AiCatalogSuggestResult> {
    const codes = [...new Set(catalogCodes.map((c) => c.toUpperCase()))].sort((a, b) =>
      a.localeCompare(b),
    );
    const allowed = new Set(codes);
    const d = (description || '').trim() || 'Sin descripción';
    try {
      const text = await this.dispatchGeminiCatalog(d, codes, labels, ctx, apiKey);
      const parsed = parseCatalogModelJson(text, allowed);
      if (!parsed.accountCode) {
        return {
          accountCode: null,
          label: null,
          source: 'gemini',
          confidence: parsed.confidence,
        };
      }
      return {
        accountCode: parsed.accountCode,
        label: labels[parsed.accountCode] || parsed.accountCode,
        source: 'gemini',
        confidence: parsed.confidence,
      };
    } catch (e) {
      const err = extractGeminiError(e);
      this.log.warn(`Catalog AI suggest failed (gemini): ${err.message}`);
      return {
        accountCode: null,
        label: null,
        source: 'gemini',
        confidence: 0,
        errorStatus: err.status,
        errorMessage: err.message,
      };
    }
  }

  private async dispatchGeminiCatalog(
    description: string,
    codes: string[],
    labels: Record<string, string>,
    ctx: AiSuggestContext | undefined,
    apiKey: string,
  ): Promise<string> {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: this.geminiModel(),
      generationConfig: {
        responseMimeType: 'application/json',
        maxOutputTokens: 256,
        temperature: 0.2,
      },
    });
    const result = await model.generateContent(buildCatalogPrompt(description, codes, labels, ctx));
    return result.response.text();
  }

  /** Legacy chart codes (4 dígitos); mantenido por compatibilidad interna. */
  async suggestAccountCode(
    description: string,
    apiKey: string,
    ctx?: AiSuggestContext,
  ): Promise<AiSuggestResult> {
    const lines = ACCOUNT_CHART_CODES.map(
      (c) => `- ${c}: ${ACCOUNT_CHART_LABELS[c]}`,
    ).join('\n');
    const prompt = `You classify one bank transaction for US LLC bookkeeping.
Allowed account codes ONLY:
${lines}
Description: ${(description || '').slice(0, 800)}
Respond JSON only: {"accountCode":"5100","confidence":0.85}`;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({
        model: this.geminiModel(),
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 128 },
      });
      const text = (await model.generateContent(prompt)).response.text();
      const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(text.trim());
      const body = fence ? fence[1].trim() : text.trim();
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const raw = parsed.accountCode ?? parsed.account_code ?? parsed.code;
      const digits = String(raw ?? '')
        .replace(/\D/g, '')
        .slice(0, 4);
      if (!digits || !isAllowedAccountCode(digits)) {
        return { accountCode: null, label: null, source: 'gemini' };
      }
      return {
        accountCode: digits,
        label: ACCOUNT_CHART_LABELS[digits] || null,
        source: 'gemini',
      };
    } catch (e) {
      const err = extractGeminiError(e);
      return {
        accountCode: null,
        label: null,
        source: 'gemini',
        errorStatus: err.status,
        errorMessage: err.message,
      };
    }
  }
}
