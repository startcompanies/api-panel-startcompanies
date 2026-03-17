import {
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { CreateLiliApplicationDto } from './dtos/create-lili-application.dto';
import { TestLiliWebhookDto } from './dtos/test-lili-webhook.dto';

type JsonRecord = Record<string, unknown>;

type NormalizedLiliWebhook = {
  event: string;
  status?: string;
  personId?: string;
  customerId?: string;
  businessExternalId?: string;
  email?: string;
  token?: string;
  raw: unknown;
};

type LiliWebhookLogEntry = {
  receivedAt: string;
  body: unknown;
  normalized: NormalizedLiliWebhook;
  _simulated?: boolean;
};

@Injectable()
export class LiliService {
  private readonly logger = new Logger(LiliService.name);
  private readonly webhookLog: LiliWebhookLogEntry[] = [];

  private getLiliBaseUrl(): string {
    return process.env.LILI_ENV === 'Prod'
      ? 'https://prod.lili.co'
      : 'https://sandbox.lili.co';
  }

  private getLiliCredentials() {
    const accessKey = process.env.LILI_ACCESS_KEY;
    const secretKey = process.env.LILI_SECRET_KEY;

    if (!accessKey || !secretKey) {
      throw new InternalServerErrorException('Lili credentials not configured');
    }

    return { accessKey, secretKey };
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null;
  }

  private getStringField(record: JsonRecord, key: string): string | undefined {
    const value = record[key];
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  normalizeWebhook(body: unknown): NormalizedLiliWebhook {
    const root = this.isRecord(body) ? body : {};
    const data = this.isRecord(root['data']) ? root['data'] : {};
    const business = this.isRecord(root['business'])
      ? root['business']
      : this.isRecord(data['business'])
        ? data['business']
        : {};

    return {
      event:
        this.getStringField(root, 'event')
        || this.getStringField(root, 'action')
        || 'unknown',
      status:
        this.getStringField(data, 'status')
        || this.getStringField(root, 'onboardingStatus')
        || this.getStringField(business, 'status'),
      personId:
        this.getStringField(root, 'personId')
        || this.getStringField(data, 'personId'),
      customerId:
        this.getStringField(root, 'customerId')
        || this.getStringField(data, 'customerId'),
      businessExternalId: this.getStringField(business, 'externalId'),
      email:
        this.getStringField(root, 'email')
        || this.getStringField(data, 'email'),
      token:
        this.getStringField(root, 'token')
        || this.getStringField(data, 'token'),
      raw: body,
    };
  }

  async createApplication(payload: CreateLiliApplicationDto) {
    const { accessKey, secretKey } = this.getLiliCredentials();

    try {
      const response = await axios.post(
        `${this.getLiliBaseUrl()}/lili/api/v1/lead`,
        payload,
        {
          headers: {
            Authorization: `lili ${accessKey}:${secretKey}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return {
        token: response.data?.token,
        location: response.data?.location,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(
          `[Lili] API error ${error.response?.status ?? 500}: ${JSON.stringify(error.response?.data ?? error.message)}`,
        );
        throw new HttpException(
          error.response?.data ?? { error: `Lili API error: ${error.response?.status ?? 500}` },
          error.response?.status ?? 500,
        );
      }

      this.logger.error(`[Lili] Unexpected error: ${error}`);
      throw new InternalServerErrorException('Internal server error');
    }
  }

  handleWebhook(body: unknown) {
    const normalized = this.normalizeWebhook(body);
    const entry: LiliWebhookLogEntry = {
      receivedAt: new Date().toISOString(),
      body,
      normalized,
    };

    this.webhookLog.unshift(entry);
    if (this.webhookLog.length > 20) {
      this.webhookLog.pop();
    }

    this.logger.log(`[Lili Webhook] Normalized: ${JSON.stringify(normalized)}`);
    this.logger.log(`[Lili Webhook] Raw: ${JSON.stringify(body)}`);

    switch (normalized.event) {
      case 'onboardingComplete':
      case 'applicationCompleted':
        this.logger.log('[Lili Webhook] TODO: cuenta abierta / CRM / DB');
        break;
      case 'applicationRejected':
      case 'onboardingRejected':
        this.logger.log('[Lili Webhook] TODO: rechazo / CRM / DB');
        break;
      default:
        this.logger.log(`[Lili Webhook] Unhandled event: ${normalized.event}`);
    }

    return { ok: true, normalized };
  }

  inspectWebhookLog() {
    return {
      count: this.webhookLog.length,
      events: this.webhookLog,
    };
  }

  simulateWebhook(dto: TestLiliWebhookDto) {
    const mockEvent = dto.event || dto.action || 'onboardingComplete';
    const mockBody = {
      event: mockEvent,
      data: dto.data || {
        email: 'test@example.com',
        customerId: 'mock-customer-id-123',
        personId: 'mock-person-id-123',
        status: 'approved',
      },
    };

    const normalized = this.normalizeWebhook(mockBody);
    const entry: LiliWebhookLogEntry = {
      receivedAt: new Date().toISOString(),
      body: mockBody,
      normalized,
      _simulated: true,
    };

    this.webhookLog.unshift(entry);
    if (this.webhookLog.length > 20) {
      this.webhookLog.pop();
    }

    this.logger.log(`[Lili Webhook - SIMULATED] Normalized: ${JSON.stringify(normalized)}`);
    this.logger.log(`[Lili Webhook - SIMULATED] Raw: ${JSON.stringify(mockBody)}`);

    return { ok: true, simulated: mockBody, normalized };
  }
}
