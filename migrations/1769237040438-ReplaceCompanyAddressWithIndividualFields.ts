import { MigrationInterface, QueryRunner } from 'typeorm';

export class ReplaceCompanyAddressWithIndividualFields1769237040438
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columnas individuales para registeredAgent
    await queryRunner.query(`
      ALTER TABLE "cuenta_bancaria_requests"
      ADD COLUMN IF NOT EXISTS "registered_agent_street" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "registered_agent_unit" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "registered_agent_city" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "registered_agent_zip_code" VARCHAR(50),
      ADD COLUMN IF NOT EXISTS "registered_agent_country" VARCHAR(255);
    `);

    // Migrar datos de company_address JSONB a columnas individuales si existe
    await queryRunner.query(`
      UPDATE "cuenta_bancaria_requests"
      SET 
        "registered_agent_street" = "company_address"->>'street',
        "registered_agent_unit" = "company_address"->>'unit',
        "registered_agent_city" = "company_address"->>'city',
        "registered_agent_zip_code" = "company_address"->>'postalCode',
        "registered_agent_country" = "company_address"->>'country'
      WHERE "company_address" IS NOT NULL;
    `);

    // Eliminar la columna company_address JSONB
    await queryRunner.query(`
      ALTER TABLE "cuenta_bancaria_requests"
      DROP COLUMN IF EXISTS "company_address";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear la columna company_address JSONB
    await queryRunner.query(`
      ALTER TABLE "cuenta_bancaria_requests"
      ADD COLUMN IF NOT EXISTS "company_address" JSONB;
    `);

    // Migrar datos de columnas individuales a company_address JSONB
    await queryRunner.query(`
      UPDATE "cuenta_bancaria_requests"
      SET "company_address" = jsonb_build_object(
        'street', COALESCE("registered_agent_street", ''),
        'unit', COALESCE("registered_agent_unit", ''),
        'city', COALESCE("registered_agent_city", ''),
        'state', COALESCE("registered_agent_state", ''),
        'postalCode', COALESCE("registered_agent_zip_code", ''),
        'country', COALESCE("registered_agent_country", 'United States')
      )
      WHERE "registered_agent_street" IS NOT NULL 
         OR "registered_agent_city" IS NOT NULL 
         OR "registered_agent_state" IS NOT NULL;
    `);

    // Eliminar las columnas individuales
    await queryRunner.query(`
      ALTER TABLE "cuenta_bancaria_requests"
      DROP COLUMN IF EXISTS "registered_agent_street",
      DROP COLUMN IF EXISTS "registered_agent_unit",
      DROP COLUMN IF EXISTS "registered_agent_city",
      DROP COLUMN IF EXISTS "registered_agent_zip_code",
      DROP COLUMN IF EXISTS "registered_agent_country";
    `);
  }
}
