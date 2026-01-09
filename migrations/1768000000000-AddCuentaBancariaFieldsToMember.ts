import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCuentaBancariaFieldsToMember1768000000000 implements MigrationInterface {
    name = 'AddCuentaBancariaFieldsToMember1768000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "members"
            ADD COLUMN "paternal_last_name" varchar(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            ADD COLUMN "maternal_last_name" varchar(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            ADD COLUMN "passport_or_national_id" varchar(100)
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            ADD COLUMN "identity_document_url" text
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            ADD COLUMN "facial_photograph_url" text
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "members"
            DROP COLUMN "facial_photograph_url"
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            DROP COLUMN "identity_document_url"
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            DROP COLUMN "passport_or_national_id"
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            DROP COLUMN "maternal_last_name"
        `);
        await queryRunner.query(`
            ALTER TABLE "members"
            DROP COLUMN "paternal_last_name"
        `);
    }
}
