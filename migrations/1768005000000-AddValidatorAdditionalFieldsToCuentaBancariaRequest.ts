import { MigrationInterface, QueryRunner } from "typeorm";

export class AddValidatorAdditionalFieldsToCuentaBancariaRequest1768005000000 implements MigrationInterface {
    name = 'AddValidatorAdditionalFieldsToCuentaBancariaRequest1768005000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campo validator_title a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "validator_title" varchar(255)
        `);

        // Agregar campo validator_income_source a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "validator_income_source" varchar(255)
        `);

        // Agregar campo validator_annual_income a cuenta_bancaria_requests (numeric para almacenar montos)
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "validator_annual_income" numeric(15, 2)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campos
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "validator_annual_income"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "validator_income_source"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "validator_title"
        `);
    }
}
