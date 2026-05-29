import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPartnerTenantContactFields1777600000000 implements MigrationInterface {
  name = 'AddPartnerTenantContactFields1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        ADD COLUMN IF NOT EXISTS whatsapp_number VARCHAR(20),
        ADD COLUMN IF NOT EXISTS website_url VARCHAR(255);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE partner_tenants
        DROP COLUMN IF EXISTS website_url,
        DROP COLUMN IF EXISTS whatsapp_number;
    `);
  }
}
