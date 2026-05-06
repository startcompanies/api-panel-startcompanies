import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankTxClassificationAndUserRules1775500000000 implements MigrationInterface {
  name = 'BankTxClassificationAndUserRules1775500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ALTER COLUMN account_code TYPE VARCHAR(64);
    `);
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS classification_source VARCHAR(24) NULL,
        ADD COLUMN IF NOT EXISTS classification_confidence DECIMAL(8,4) NULL,
        ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS payee_normalized VARCHAR(255) NULL;
    `);

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

    await queryRunner.query(`
      INSERT INTO account_catalog (code, name, type, pl_section, pl_group, order_index, is_system, is_locked, active)
      VALUES
        ('INTERCO', 'Operaciones intercompañía', 'other', 'Intercompany', 'Intercompany', 285, TRUE, TRUE, TRUE)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_user_classification_rules_owner_payee_source;`);
    await queryRunner.query(`DROP TABLE IF EXISTS user_classification_rules;`);
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        DROP COLUMN IF EXISTS classification_source,
        DROP COLUMN IF EXISTS classification_confidence,
        DROP COLUMN IF EXISTS needs_review,
        DROP COLUMN IF EXISTS payee_normalized;
    `);
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ALTER COLUMN account_code TYPE VARCHAR(20);
    `);
    await queryRunner.query(`DELETE FROM account_catalog WHERE code = 'INTERCO';`);
  }
}
