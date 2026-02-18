import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePanelTables1765647038967 implements MigrationInterface {
    name = 'CreatePanelTables1765647038967'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_preferences" ALTER COLUMN "notifications" SET DEFAULT '{"email": true, "push": true, "requestUpdates": true, "documentUploads": true}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user_preferences" ALTER COLUMN "notifications" SET DEFAULT '{"push": true, "email": true, "requestUpdates": true, "documentUploads": true}'`);
    }

}
