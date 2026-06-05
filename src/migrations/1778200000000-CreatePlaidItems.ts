import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlaidItems1778200000000 implements MigrationInterface {
  name = 'CreatePlaidItems1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plaid_items (
        id SERIAL PRIMARY KEY,
        owner_user_id INT NOT NULL,
        bank_account_id INT NOT NULL,
        plaid_item_id VARCHAR(64) NOT NULL UNIQUE,
        access_token_ciphertext TEXT NOT NULL,
        access_token_iv VARCHAR(32) NOT NULL,
        access_token_auth_tag VARCHAR(32) NOT NULL,
        institution_id VARCHAR(64) NULL,
        institution_name VARCHAR(120) NULL,
        account_mask VARCHAR(20) NULL,
        sync_cursor TEXT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'active',
        last_synced_at TIMESTAMPTZ NULL,
        last_sync_error TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_plaid_items_owner_user_id ON plaid_items(owner_user_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_plaid_items_owner_status ON plaid_items(owner_user_id, status);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS plaid_items;`);
  }
}
