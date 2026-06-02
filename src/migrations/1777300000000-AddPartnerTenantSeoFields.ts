import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartnerTenantSeoFields1777300000000 implements MigrationInterface {
  name = 'AddPartnerTenantSeoFields1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        ADD COLUMN IF NOT EXISTS seo_title VARCHAR(120) NULL,
        ADD COLUMN IF NOT EXISTS seo_description VARCHAR(300) NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        DROP COLUMN IF EXISTS seo_description,
        DROP COLUMN IF EXISTS seo_title;
    `);
  }
}
