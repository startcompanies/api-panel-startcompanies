import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuideRichContentAndAttachment1775300000000 implements MigrationInterface {
  name = 'AddGuideRichContentAndAttachment1775300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "llc_guides" ADD COLUMN IF NOT EXISTS "content_html" text`);
    await queryRunner.query(`ALTER TABLE "llc_guides" ADD COLUMN IF NOT EXISTS "attachment_url" text`);
    await queryRunner.query(
      `ALTER TABLE "llc_guides" ADD COLUMN IF NOT EXISTS "attachment_mime" character varying(120)`,
    );
    await queryRunner.query(`UPDATE "llc_guides" SET "content_html" = "content" WHERE "content_html" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "llc_guides" DROP COLUMN IF EXISTS "attachment_mime"`);
    await queryRunner.query(`ALTER TABLE "llc_guides" DROP COLUMN IF EXISTS "attachment_url"`);
    await queryRunner.query(`ALTER TABLE "llc_guides" DROP COLUMN IF EXISTS "content_html"`);
  }
}

