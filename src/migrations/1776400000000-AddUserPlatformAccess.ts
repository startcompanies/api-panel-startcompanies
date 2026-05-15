import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserPlatformAccess1776400000000 implements MigrationInterface {
  name = 'AddUserPlatformAccess1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS platform_plan_code VARCHAR(40),
        ADD COLUMN IF NOT EXISTS platform_access_ends_at TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS platform_features JSONB;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN IF EXISTS platform_plan_code,
        DROP COLUMN IF EXISTS platform_access_ends_at,
        DROP COLUMN IF EXISTS platform_features;
    `);
  }
}
