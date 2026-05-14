import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAccountCatalogLevel1776100000000 implements MigrationInterface {
  name = 'AddAccountCatalogLevel1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_catalog
      ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
    `);

    // Codes that end in '000' (numeric parent accounts) are level 0
    await queryRunner.query(`
      UPDATE account_catalog
      SET level = 0
      WHERE code ~ '^[0-9]+000$';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE account_catalog DROP COLUMN IF EXISTS level;
    `);
  }
}
