import { MigrationInterface, QueryRunner } from 'typeorm';

const DEFAULT_CONFIGS: Record<string, object> = {
  Entrepreneur: {
    trialMonths: 3,
    monthlyPriceAfterTrial: 25,
    features: {
      invoicing: true,
      accounting: true,
      accountingAi: false,
      aiConfig: false,
      videos: false,
      guides: true,
    },
  },
  Elite: {
    trialMonths: 12,
    monthlyPriceAfterTrial: null,
    features: {
      invoicing: true,
      accounting: true,
      accountingAi: true,
      aiConfig: true,
      videos: true,
      guides: true,
    },
  },
  Premium: {
    trialMonths: 24,
    monthlyPriceAfterTrial: null,
    features: {
      invoicing: true,
      accounting: true,
      accountingAi: true,
      aiConfig: true,
      videos: true,
      guides: true,
    },
  },
};

export class AddPricingPlanPlatformConfig1776300000000 implements MigrationInterface {
  name = 'AddPricingPlanPlatformConfig1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE pricing_plans
        ADD COLUMN IF NOT EXISTS platform_config JSONB;
    `);

    for (const [code, config] of Object.entries(DEFAULT_CONFIGS)) {
      await queryRunner.query(
        `UPDATE pricing_plans SET platform_config = $1 WHERE code = $2 AND platform_config IS NULL`,
        [JSON.stringify(config), code],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE pricing_plans DROP COLUMN IF EXISTS platform_config;`);
  }
}
