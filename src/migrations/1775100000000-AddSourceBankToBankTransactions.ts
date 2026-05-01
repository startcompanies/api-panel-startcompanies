import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSourceBankToBankTransactions1775100000000 implements MigrationInterface {
  name = 'AddSourceBankToBankTransactions1775100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS source_bank VARCHAR(64) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions DROP COLUMN IF EXISTS source_bank;
    `);
  }
}
