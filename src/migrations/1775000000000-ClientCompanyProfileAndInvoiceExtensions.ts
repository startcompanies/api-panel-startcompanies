import { MigrationInterface, QueryRunner } from 'typeorm';

export class ClientCompanyProfileAndInvoiceExtensions1775000000000 implements MigrationInterface {
  name = 'ClientCompanyProfileAndInvoiceExtensions1775000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS client_company_profiles (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        legal_name VARCHAR(240) NULL,
        ein VARCHAR(20) NULL,
        address TEXT NULL,
        billing_email VARCHAR(180) NULL,
        phone VARCHAR(40) NULL,
        bank_name VARCHAR(160) NULL,
        account_number VARCHAR(64) NULL,
        routing_ach VARCHAR(20) NULL,
        swift VARCHAR(20) NULL,
        iban VARCHAR(48) NULL,
        zelle_or_paypal VARCHAR(180) NULL,
        logo_url TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_client_company_profiles_user_id ON client_company_profiles(user_id);
    `);

    await queryRunner.query(`
      ALTER TABLE invoices ALTER COLUMN client_id DROP NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE invoices
        ADD COLUMN IF NOT EXISTS owner_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(40) NULL,
        ADD COLUMN IF NOT EXISTS bill_to JSONB NULL,
        ADD COLUMN IF NOT EXISTS payment_instructions JSONB NULL,
        ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(6,4) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tax_label VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS issue_date DATE NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE invoice_items
        ADD COLUMN IF NOT EXISTS product_name VARCHAR(220) NULL,
        ADD COLUMN IF NOT EXISTS unit_measure VARCHAR(20) NULL DEFAULT 'u',
        ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE catalog_items
        ADD COLUMN IF NOT EXISTS owner_user_id INT NULL REFERENCES users(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS unit_measure VARCHAR(20) NULL DEFAULT 'u';
    `);

    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS accounting_date DATE NULL,
        ADD COLUMN IF NOT EXISTS account_code VARCHAR(20) NULL,
        ADD COLUMN IF NOT EXISTS invoice_match_note VARCHAR(255) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        DROP COLUMN IF EXISTS invoice_match_note,
        DROP COLUMN IF EXISTS account_code,
        DROP COLUMN IF EXISTS accounting_date;
    `);
    await queryRunner.query(`
      ALTER TABLE catalog_items
        DROP COLUMN IF EXISTS unit_measure,
        DROP COLUMN IF EXISTS owner_user_id;
    `);
    await queryRunner.query(`
      ALTER TABLE invoice_items
        DROP COLUMN IF EXISTS discount_percent,
        DROP COLUMN IF EXISTS unit_measure,
        DROP COLUMN IF EXISTS product_name;
    `);
    await queryRunner.query(`
      ALTER TABLE invoices
        DROP COLUMN IF EXISTS issue_date,
        DROP COLUMN IF EXISTS tax_label,
        DROP COLUMN IF EXISTS tax_rate,
        DROP COLUMN IF EXISTS payment_instructions,
        DROP COLUMN IF EXISTS bill_to,
        DROP COLUMN IF EXISTS invoice_number,
        DROP COLUMN IF EXISTS owner_user_id;
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS client_company_profiles;`);
  }
}
