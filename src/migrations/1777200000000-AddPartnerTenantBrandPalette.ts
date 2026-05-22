import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartnerTenantBrandPalette1777200000000 implements MigrationInterface {
  name = 'AddPartnerTenantBrandPalette1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        ADD COLUMN IF NOT EXISTS brand_palette VARCHAR(20) NOT NULL DEFAULT 'blue',
        ADD COLUMN IF NOT EXISTS shell_appearance VARCHAR(10) NOT NULL DEFAULT 'dark',
        ADD COLUMN IF NOT EXISTS accent_color VARCHAR(20) NULL;
    `);

    await queryRunner.query(`
      UPDATE partner_tenants
      SET brand_palette = 'custom'
      WHERE primary_color IS NOT NULL
        AND LOWER(TRIM(primary_color)) NOT IN ('#0068bd', '#006afe');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        DROP COLUMN IF EXISTS accent_color,
        DROP COLUMN IF EXISTS shell_appearance,
        DROP COLUMN IF EXISTS brand_palette;
    `);
  }
}
