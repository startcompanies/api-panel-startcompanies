import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBillingSubscriptionToUsers1773000000000 implements MigrationInterface {
  name = 'AddBillingSubscriptionToUsers1773000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "stripe_customer_id" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_access_state" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_trial_start_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_trial_end_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_subscription_id" character varying(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_subscription_status" character varying(40)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_subscription_current_period_end" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_subscription_cancel_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_monthly_price_usd" numeric(10,2) NOT NULL DEFAULT 25`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_users_stripe_customer_id" ON "users" ("stripe_customer_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_stripe_customer_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_monthly_price_usd"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_subscription_cancel_at"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_subscription_current_period_end"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_subscription_status"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_subscription_id"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_trial_end_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_trial_start_at"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "billing_access_state"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "stripe_customer_id"`);
  }
}

