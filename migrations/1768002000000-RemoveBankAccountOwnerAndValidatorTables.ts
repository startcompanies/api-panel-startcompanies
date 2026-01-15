import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para eliminar las tablas bank_account_owners y bank_account_validators
 * que ya no se usan después de consolidar sus campos en Member y CuentaBancariaRequest
 * 
 * IMPORTANTE: Antes de ejecutar esta migración, asegúrate de:
 * 1. Migrar cualquier dato existente de bank_account_owners a members
 * 2. Migrar cualquier dato existente de bank_account_validators a cuenta_bancaria_requests
 * 3. Eliminar o deprecar el código que todavía referencia estas entidades
 */
export class RemoveBankAccountOwnerAndValidatorTables1768002000000
  implements MigrationInterface
{
  name = 'RemoveBankAccountOwnerAndValidatorTables1768002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar la tabla bank_account_validators primero (puede tener foreign keys)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "bank_account_validators" CASCADE;
    `);

    // Eliminar la tabla bank_account_owners
    await queryRunner.query(`
      DROP TABLE IF EXISTS "bank_account_owners" CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear bank_account_owners (estructura básica - ajustar según necesidad)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bank_account_owners" (
        "id" SERIAL NOT NULL,
        "request_id" INTEGER NOT NULL,
        "first_name" VARCHAR(255),
        "paternal_last_name" VARCHAR(255),
        "maternal_last_name" VARCHAR(255),
        "date_of_birth" DATE,
        "nationality" VARCHAR(100),
        "passport_or_national_id" VARCHAR(100),
        "identity_document_url" TEXT,
        "facial_photograph_url" TEXT,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_bank_account_owners" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bank_account_owners_request" FOREIGN KEY ("request_id") 
          REFERENCES "requests"("id") ON DELETE CASCADE
      );
    `);

    // Recrear bank_account_validators (estructura básica - ajustar según necesidad)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "bank_account_validators" (
        "id" SERIAL NOT NULL,
        "request_id" INTEGER NOT NULL,
        "first_name" VARCHAR(255),
        "last_name" VARCHAR(255),
        "date_of_birth" DATE,
        "nationality" VARCHAR(100),
        "citizenship" VARCHAR(100),
        "passport_number" VARCHAR(100),
        "scanned_passport_url" TEXT,
        "work_email" VARCHAR(255),
        "use_email_for_relay_login" BOOLEAN DEFAULT false,
        "phone" VARCHAR(50),
        "can_receive_sms" BOOLEAN DEFAULT false,
        "is_us_resident" BOOLEAN,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_bank_account_validators" PRIMARY KEY ("id"),
        CONSTRAINT "FK_bank_account_validators_request" FOREIGN KEY ("request_id") 
          REFERENCES "requests"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_bank_account_validators_request" UNIQUE ("request_id")
      );
    `);
  }
}
