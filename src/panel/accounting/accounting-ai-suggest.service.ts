import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import {
  ACCOUNT_CHART_CODES,
  ACCOUNT_CHART_LABELS,
  isAllowedAccountCode,
} from './accounting-chart.constants';

export type AiSuggestSource = 'anthropic' | 'openai';

export type AiSuggestResult = {
  accountCode: string | null;
  label: string | null;
  source: AiSuggestSource;
  /** Status HTTP del proveedor si falló (p.ej. 429 cuota). */
  errorStatus?: number;
  /** Mensaje de error del proveedor (recortado). */
  errorMessage?: string;
};

export type AiSuggestContext = {
  /** Monto en USD del movimiento; negativo = salida (gasto probable → 5xxx). */
  amountUsd?: number;
};

function buildPrompt(description: string, ctx?: AiSuggestContext): string {
  const lines = ACCOUNT_CHART_CODES.map(
    (c) => `- ${c}: ${ACCOUNT_CHART_LABELS[c]}`,
  ).join('\n');
  const amt =
    ctx?.amountUsd !== undefined && Number.isFinite(ctx.amountUsd)
      ? `\nAmount USD: ${ctx.amountUsd} (negative = money out → prefer expense codes 5xxx; positive inflow → income 4xxx).\n`
      : '';
  return `You classify one bank transaction for US LLC bookkeeping (cash basis).
Allowed account codes ONLY (pick exactly one code from this list, nothing else):
${lines}
${amt}
Bank transaction description (may be short or messy):
"""
${description.slice(0, 800)}
"""

Respond with a single JSON object and no other text, format:
{"accountCode":"5100","confidence":0.85,"rationale":"one short phrase"}
Use the key exactly "accountCode" (string). accountCode must be one of: ${ACCOUNT_CHART_CODES.join(',')}.
If unsure, pick the closest expense code 5700 or income 4100.`;
}

function extractAccountCodeFromParsed(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const o = parsed as Record<string, unknown>;
  const raw = o.accountCode ?? o.account_code ?? o.code ?? o.AccountCode;
  const code = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 4);
  return code || undefined;
}

function parseModelJson(text: string): { accountCode?: string } {
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
  const code = extractAccountCodeFromParsed(parsed);
  return { accountCode: code };
}

@Injectable()
export class AccountingAiSuggestService {
  private readonly log = new Logger(AccountingAiSuggestService.name);

  constructor(private readonly config: ConfigService) {}

  async suggestAccountCode(
    description: string,
    provider: AiSuggestSource,
    apiKey: string,
    ctx?: AiSuggestContext,
  ): Promise<AiSuggestResult> {
    const d = (description || '').trim() || 'Sin descripción';
    if (provider === 'anthropic') {
      return this.suggestAnthropic(d, apiKey, ctx);
    }
    return this.suggestOpenAi(d, apiKey, ctx);
  }

  private anthropicModel(): string {
    return this.config.get<string>('ANTHROPIC_MODEL') || 'claude-3-5-haiku-20241022';
  }

  private openaiModel(): string {
    return this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
  }

  private async suggestAnthropic(
    description: string,
    apiKey: string,
    ctx?: AiSuggestContext,
  ): Promise<AiSuggestResult> {
    try {
      const client = new Anthropic({ apiKey });
      const msg = await client.messages.create({
        model: this.anthropicModel(),
        max_tokens: 256,
        messages: [{ role: 'user', content: buildPrompt(description, ctx) }],
      });
      const block = msg.content.find((b) => b.type === 'text');
      const text = block && block.type === 'text' ? block.text : '';
      return this.normalizeResult(text, 'anthropic');
    } catch (e) {
      const err = e as { message?: string; status?: number };
      this.log.warn(`Anthropic suggest failed: ${err.message || e} (status=${err.status ?? 'n/a'})`);
      return {
        accountCode: null,
        label: null,
        source: 'anthropic',
        errorStatus: err.status,
        errorMessage: (err.message || '').slice(0, 300) || undefined,
      };
    }
  }

  private async suggestOpenAi(
    description: string,
    apiKey: string,
    ctx?: AiSuggestContext,
  ): Promise<AiSuggestResult> {
    try {
      const client = new OpenAI({ apiKey });
      const res = await client.chat.completions.create({
        model: this.openaiModel(),
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'user',
            content: buildPrompt(description, ctx),
          },
        ],
      });
      const text = res.choices[0]?.message?.content || '';
      return this.normalizeResult(text, 'openai');
    } catch (e) {
      const err = e as { message?: string; status?: number };
      this.log.warn(`OpenAI suggest failed: ${err.message || e} (status=${err.status ?? 'n/a'})`);
      return {
        accountCode: null,
        label: null,
        source: 'openai',
        errorStatus: err.status,
        errorMessage: (err.message || '').slice(0, 300) || undefined,
      };
    }
  }

  private normalizeResult(text: string, source: AiSuggestSource): AiSuggestResult {
    try {
      const { accountCode: raw } = parseModelJson(text);
      if (!raw || !isAllowedAccountCode(raw)) {
        if (text?.trim()) {
          this.log.debug(`AI response not mapped to chart (source=${source}): ${text.slice(0, 200)}`);
        }
        return { accountCode: null, label: null, source };
      }
      const digits = String(raw).replace(/\D/g, '').slice(0, 4);
      return {
        accountCode: digits,
        label: ACCOUNT_CHART_LABELS[digits] || null,
        source,
      };
    } catch (e) {
      this.log.warn(`AI JSON parse failed (${source}): ${(e as Error).message}`);
      return { accountCode: null, label: null, source };
    }
  }
}
