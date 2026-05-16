import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricingPlanMemberType1776200000000 implements MigrationInterface {
  name = 'AddPricingPlanMemberType1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pricing_plans
        ADD COLUMN IF NOT EXISTS member_type VARCHAR(10) NOT NULL DEFAULT 'both';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pricing_plans DROP COLUMN IF EXISTS member_type;
    `);
  }
}
