import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foto de pasaporte del validador bancario (sección 3 — Apertura bancaria en Apertura LLC).
 */
export class AddBankVerifierPassportUrlToAperturaLlcRequest1778600000000
  implements MigrationInterface
{
  name = 'AddBankVerifierPassportUrlToAperturaLlcRequest1778600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "apertura_llc_requests"
      ADD COLUMN IF NOT EXISTS "bank_verifier_passport_url" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "apertura_llc_requests"
      DROP COLUMN IF EXISTS "bank_verifier_passport_url"
    `);
  }
}
