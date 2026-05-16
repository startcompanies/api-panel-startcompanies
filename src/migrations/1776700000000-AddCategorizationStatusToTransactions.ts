import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategorizationStatusToTransactions1776700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Nuevo campo: estado de categorización
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        ADD COLUMN IF NOT EXISTS categorization_status VARCHAR(24) NOT NULL DEFAULT 'pendiente',
        ADD COLUMN IF NOT EXISTS suggested_account_code VARCHAR(64) NULL
    `);

    // Retroalimentar: transacciones ya categorizadas → 'categorizado'
    await queryRunner.query(`
      UPDATE bank_transactions
         SET categorization_status = 'categorizado'
       WHERE account_code IS NOT NULL
    `);

    // Transacciones con needs_review=true sin account_code → 'revision' (sugerencia pendiente)
    await queryRunner.query(`
      UPDATE bank_transactions
         SET categorization_status = 'revision'
       WHERE account_code IS NULL
         AND needs_review = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE bank_transactions
        DROP COLUMN IF EXISTS categorization_status,
        DROP COLUMN IF EXISTS suggested_account_code
    `);
  }
}
