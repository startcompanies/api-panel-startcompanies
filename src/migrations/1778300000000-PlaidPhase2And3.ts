import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaidPhase2And31778300000000 implements MigrationInterface {
  name = 'PlaidPhase2And31778300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plaid_webhook_events (
        id VARCHAR(128) PRIMARY KEY,
        type VARCHAR(64) NOT NULL,
        item_id VARCHAR(64) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // accountingPlaid: true donde ya tienen accounting en platform_config
    await queryRunner.query(`
      UPDATE pricing_plans
      SET platform_config = jsonb_set(
        platform_config,
        '{features,accountingPlaid}',
        'true'::jsonb,
        true
      )
      WHERE platform_config IS NOT NULL
        AND (platform_config->'features'->>'accounting')::boolean IS TRUE
        AND platform_config->'features'->'accountingPlaid' IS NULL;
    `);

    await queryRunner.query(`
      UPDATE users
      SET platform_features = jsonb_set(
        platform_features,
        '{accountingPlaid}',
        'true'::jsonb,
        true
      )
      WHERE platform_features IS NOT NULL
        AND (platform_features->>'accounting')::boolean IS TRUE
        AND platform_features->'accountingPlaid' IS NULL;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plaid_connect_reminders (
        user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS plaid_connect_reminders;`);
    await queryRunner.query(`DROP TABLE IF EXISTS plaid_webhook_events;`);
  }
}
