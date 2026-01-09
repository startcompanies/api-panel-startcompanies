import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSection2FieldsToCuentaBancariaRequest1768004000000 implements MigrationInterface {
    name = 'AddSection2FieldsToCuentaBancariaRequest1768004000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campo incorporation_state a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "incorporation_state" varchar(255)
        `);

        // Agregar campo incorporation_month_year a cuenta_bancaria_requests
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "incorporation_month_year" varchar(50)
        `);

        // Agregar campo countries_where_business a cuenta_bancaria_requests (text para almacenar array como string separado por comas o JSON)
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "countries_where_business" text
        `);

        // Agregar campo registered_agent_state a cuenta_bancaria_requests (para tener el estado por separado además de la dirección completa)
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "registered_agent_state" varchar(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campos
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "registered_agent_state"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "countries_where_business"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "incorporation_month_year"
        `);

        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            DROP COLUMN "incorporation_state"
        `);
    }
}
