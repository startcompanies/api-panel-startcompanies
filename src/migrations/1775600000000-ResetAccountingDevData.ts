import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetAccountingDevData1775600000000 implements MigrationInterface {
  name = 'ResetAccountingDevData1775600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dev reset: limpia datos operativos de contabilidad sin tocar catálogo global.
    await queryRunner.query(`
      TRUNCATE TABLE bank_transactions RESTART IDENTITY CASCADE;
    `);
    await queryRunner.query(`
      TRUNCATE TABLE bank_imports RESTART IDENTITY CASCADE;
    `);
    await queryRunner.query(`
      TRUNCATE TABLE user_classification_rules RESTART IDENTITY CASCADE;
    `);
  }

  public async down(): Promise<void> {
    // No reversible: migración intencional de limpieza de datos.
  }
}

