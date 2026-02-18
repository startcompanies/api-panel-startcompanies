import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNumberOfEmployeesAndWebsiteToCuentaBancariaRequest1767900000000 implements MigrationInterface {
    name = 'AddNumberOfEmployeesAndWebsiteToCuentaBancariaRequest1767900000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campo number_of_employees a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "number_of_employees" varchar(50)
        `);

        // Agregar campo website_or_social_media a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "website_or_social_media" varchar(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campos
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "website_or_social_media"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "number_of_employees"
        `);
    }
}
