import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina los códigos de cuenta alfanuméricos legacy (ADMIN, PAYROLL, SALES, etc.)
 * que convivían con el nuevo plan numérico (4100, 5100, 6100…).
 * Las transacciones que usaban esos códigos quedan con account_code = NULL
 * y categorization_status = 'pendiente' para ser re-categorizadas.
 */
export class RemoveLegacyAlphaAccountCodes1776900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Limpia account_code en transacciones que apunten a códigos alfanuméricos legacy
    await queryRunner.query(`
      UPDATE bank_transactions
         SET account_code            = NULL,
             suggested_account_code  = NULL,
             categorization_status   = 'pendiente'
       WHERE account_code IS NOT NULL
         AND account_code !~ '^[0-9]'
    `);

    // Elimina los códigos alfanuméricos del catálogo
    await queryRunner.query(`
      DELETE FROM account_catalog
       WHERE code !~ '^[0-9]'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No restauramos los datos eliminados (irreversible por diseño)
  }
}
