import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEinLetterUrlToCuentaBancariaRequest1767855000000 implements MigrationInterface {
    name = 'AddEinLetterUrlToCuentaBancariaRequest1767855000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campo ein_letter_url a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "ein_letter_url" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campo ein_letter_url
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "ein_letter_url"
        `);
    }
}
