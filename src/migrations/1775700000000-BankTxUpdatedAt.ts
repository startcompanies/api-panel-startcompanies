import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankTxUpdatedAt1775700000000 implements MigrationInterface {
  name = 'BankTxUpdatedAt1775700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON bank_transactions;
      CREATE TRIGGER trg_bank_transactions_updated_at
        BEFORE UPDATE ON bank_transactions
        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_bank_transactions_updated_at ON bank_transactions;`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at();`);
    await queryRunner.query(`ALTER TABLE bank_transactions DROP COLUMN IF EXISTS updated_at;`);
  }
}
