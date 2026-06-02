import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePartnerTenants1777100000000 implements MigrationInterface {
  name = 'CreatePartnerTenants1777100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS partner_tenants (
        id SERIAL PRIMARY KEY,
        partner_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        slug VARCHAR(60) NOT NULL UNIQUE,
        display_name VARCHAR(120) NOT NULL,
        custom_domain VARCHAR(255) NOT NULL UNIQUE,
        frontend_base_url VARCHAR(255) NOT NULL,
        logo_url TEXT NULL,
        logo_dark_url TEXT NULL,
        favicon_url TEXT NULL,
        primary_color VARCHAR(20) NULL,
        secondary_color VARCHAR(20) NULL,
        enabled_surfaces JSONB NOT NULL DEFAULT '["panel","wizard"]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_partner_tenants_custom_domain
        ON partner_tenants (LOWER(custom_domain))
        WHERE is_active = TRUE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS partner_tenants;`);
  }
}
