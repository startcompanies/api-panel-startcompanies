import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateInvoiceBillingClients1775800000000 implements MigrationInterface {
  name = 'CreateInvoiceBillingClients1775800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoice_billing_clients (
        id SERIAL PRIMARY KEY,
        owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_name VARCHAR(240) NOT NULL,
        ein VARCHAR(32) NULL,
        address TEXT NULL,
        email VARCHAR(180) NULL,
        phone VARCHAR(40) NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_billing_clients_owner
        ON invoice_billing_clients(owner_user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS invoice_billing_clients;`);
  }
}
