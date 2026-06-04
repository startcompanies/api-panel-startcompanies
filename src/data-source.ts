import 'reflect-metadata';
import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { User } from './shared/user/entities/user.entity';

// Cargar variables de entorno
dotenv.config();

// Importar entidades nuevas del Panel
import { Request } from './panel/requests/entities/request.entity';
import { AperturaLlcRequest } from './panel/requests/entities/apertura-llc-request.entity';
import { RenovacionLlcRequest } from './panel/requests/entities/renovacion-llc-request.entity';
import { CuentaBancariaRequest } from './panel/requests/entities/cuenta-bancaria-request.entity';
import { Member } from './panel/requests/entities/member.entity';
// BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
// RequestRequiredDocument ya no se usa - eliminado
// ProcessStep ya no se usa - eliminado
// Document ya no se usa - URLs se guardan directamente en campos de request
import { Notification } from './panel/notifications/entities/notification.entity';
import { UserPreferences } from './panel/settings/entities/user-preferences.entity';
import { ClientCompanyProfile } from './panel/settings/entities/client-company-profile.entity';
import { ProcessConfig } from './panel/settings/entities/process-config.entity';
import { Client } from './panel/clients/entities/client.entity';
import { ZohoDealTimeline } from './panel/requests/entities/zoho-deal-timeline.entity';
import { ZohoConfig } from './zoho-config/zoho-config.entity';
import { StripeWebhookEvent } from './panel/billing/entities/stripe-webhook-event.entity';
import { Invoice } from './panel/invoicing/entities/invoice.entity';
import { InvoiceItem } from './panel/invoicing/entities/invoice-item.entity';
import { InvoicePayment } from './panel/invoicing/entities/invoice-payment.entity';
import { InvoiceEvent } from './panel/invoicing/entities/invoice-event.entity';
import { InvoiceBillingClient } from './panel/invoicing/entities/invoice-billing-client.entity';
import { CatalogCategory } from './panel/catalog/entities/catalog-category.entity';
import { CatalogItem } from './panel/catalog/entities/catalog-item.entity';
import { CatalogPrice } from './panel/catalog/entities/catalog-price.entity';
import { BankAccount } from './panel/accounting/entities/bank-account.entity';
import { BankImport } from './panel/accounting/entities/bank-import.entity';
import { BankTransaction } from './panel/accounting/entities/bank-transaction.entity';
import { AccountingCategory } from './panel/accounting/entities/accounting-category.entity';
import { PlSnapshot } from './panel/accounting/entities/pl-snapshot.entity';
import { LibraryFolder } from './panel/documents-library/entities/library-folder.entity';
import { LibraryDocument } from './panel/documents-library/entities/library-document.entity';
import { LibraryTag } from './panel/documents-library/entities/library-tag.entity';
import { DocumentShare } from './panel/documents-library/entities/document-share.entity';
import { PremiumVideo } from './panel/media/entities/premium-video.entity';
import { LlcGuide } from './panel/media/entities/llc-guide.entity';
import { ContentAccessLog } from './panel/media/entities/content-access-log.entity';
import { PricingPlan } from './panel/pricing/entities/pricing-plan.entity';
import { PricingPlanState } from './panel/pricing/entities/pricing-plan-state.entity';
import { PricingPlanFeature } from './panel/pricing/entities/pricing-plan-feature.entity';
import { PricingRenewal } from './panel/pricing/entities/pricing-renewal.entity';
import { PricingOverride } from './panel/pricing/entities/pricing-override.entity';
import { PricingMisc } from './panel/pricing/entities/pricing-misc.entity';
import { PartnerTenant } from './panel/partner-tenants/entities/partner-tenant.entity';
import { PlaidItem } from './panel/plaid/entities/plaid-item.entity';

// Validar que existan las variables de entorno requeridas
const requiredEnvVars = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingVars = requiredEnvVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
  console.warn(
    `⚠️  Advertencia: Faltan variables de entorno: ${missingVars.join(', ')}. Usando valores por defecto.`,
  );
}

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'startcompanies',
  entities: [
    // Entidades del Panel
    User,
    Request,
    AperturaLlcRequest,
    RenovacionLlcRequest,
    CuentaBancariaRequest,
    Member,
    // BankAccountValidator y BankAccountOwner ya no se usan - consolidados en Member y CuentaBancariaRequest
    // RequestRequiredDocument, Document, ProcessStep, UserPreferences y ProcessConfig eliminados - no se usan
    Notification,
    Client,
    ZohoDealTimeline,
    ZohoConfig,
    StripeWebhookEvent,
    ClientCompanyProfile,
    Invoice,
    InvoiceItem,
    InvoicePayment,
    InvoiceEvent,
    InvoiceBillingClient,
    CatalogCategory,
    CatalogItem,
    CatalogPrice,
    BankAccount,
    BankImport,
    BankTransaction,
    AccountingCategory,
    PlSnapshot,
    LibraryFolder,
    LibraryDocument,
    LibraryTag,
    DocumentShare,
    PremiumVideo,
    LlcGuide,
    ContentAccessLog,
    PricingPlan,
    PricingPlanState,
    PricingPlanFeature,
    PricingRenewal,
    PricingOverride,
    PricingMisc,
    PartnerTenant,
    PlaidItem,
  ],
  migrations: [
    // Compiladas junto a src → dist/src/migrations (npm run migration:run / migration:run:prod)
    path.join(__dirname, 'migrations', '*.{ts,js}'),
  ],
  migrationsTableName: 'migrations',
  synchronize: false, // NUNCA usar synchronize en producción
  logging: process.env.NODE_ENV === 'development' || process.env.MODE === 'DEV',
};

const dataSource = new DataSource(dataSourceOptions);

export default dataSource;
