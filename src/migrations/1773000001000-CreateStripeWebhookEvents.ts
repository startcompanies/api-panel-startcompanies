import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateStripeWebhookEvents1773000001000 implements MigrationInterface {
  name = 'CreateStripeWebhookEvents1773000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "stripe_webhook_events" (
        "id" character varying(100) NOT NULL,
        "type" character varying(120) NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stripe_webhook_events_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "stripe_webhook_events"`);
  }
}

