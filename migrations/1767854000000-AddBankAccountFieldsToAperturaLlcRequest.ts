import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBankAccountFieldsToAperturaLlcRequest1767854000000 implements MigrationInterface {
    name = 'AddBankAccountFieldsToAperturaLlcRequest1767854000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campos para apertura bancaria (Sección 3)
        await queryRunner.query(`
            ALTER TABLE "apertura_llc_requests" 
            ADD COLUMN "service_bill_url" text,
            ADD COLUMN "bank_statement_url" text,
            ADD COLUMN "periodic_income_10k" character varying(10),
            ADD COLUMN "bank_account_linked_email" character varying(255),
            ADD COLUMN "bank_account_linked_phone" character varying(50),
            ADD COLUMN "project_or_company_url" character varying(500)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campos de apertura bancaria
        await queryRunner.query(`
            ALTER TABLE "apertura_llc_requests" 
            DROP COLUMN "project_or_company_url",
            DROP COLUMN "bank_account_linked_phone",
            DROP COLUMN "bank_account_linked_email",
            DROP COLUMN "periodic_income_10k",
            DROP COLUMN "bank_statement_url",
            DROP COLUMN "service_bill_url"
        `);
    }
}
