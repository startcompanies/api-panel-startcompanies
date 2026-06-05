import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Movimientos en `revision` sin suggested_account_code (legacy tras migraciones
 * RemoveLegacyAlphaAccountCodes + AddCategorizationStatus). Vuelven a pendiente.
 */
export class FixOrphanReviewTransactions1778400000000 implements MigrationInterface {
  name = 'FixOrphanReviewTransactions1778400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE bank_transactions
      SET needs_review = FALSE,
          categorization_status = 'pendiente'
      WHERE needs_review = TRUE
        AND (suggested_account_code IS NULL OR TRIM(suggested_account_code) = '')
        AND (account_code IS NULL OR TRIM(account_code) = '');
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    /* irreversible */
  }
}
