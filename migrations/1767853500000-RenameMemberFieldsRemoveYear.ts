import { MigrationInterface, QueryRunner } from "typeorm";

export class RenameMemberFieldsRemoveYear1767853500000 implements MigrationInterface {
    name = 'RenameMemberFieldsRemoveYear1767853500000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Renombrar columnas de members para eliminar el año específico (2024)
        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "owner_contributions_2024" TO "owner_contributions"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "owner_loans_to_llc_2024" TO "owner_loans_to_llc"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "loans_reimbursed_by_llc_2024" TO "loans_reimbursed_by_llc"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "profit_distributions_2024" TO "profit_distributions"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Revertir los cambios: renombrar de vuelta a los nombres con año
        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "owner_contributions" TO "owner_contributions_2024"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "owner_loans_to_llc" TO "owner_loans_to_llc_2024"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "loans_reimbursed_by_llc" TO "loans_reimbursed_by_llc_2024"
        `);

        await queryRunner.query(`
            ALTER TABLE "members" 
            RENAME COLUMN "profit_distributions" TO "profit_distributions_2024"
        `);
    }
}
