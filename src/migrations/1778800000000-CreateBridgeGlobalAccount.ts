import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBridgeGlobalAccount1778800000000 implements MigrationInterface {
  name = 'CreateBridgeGlobalAccount1778800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "bridge_accounts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" integer NOT NULL,
        "account_type" character varying(20) NOT NULL,
        "bridge_customer_id" character varying(120),
        "bridge_kyc_link_id" character varying(120),
        "kyc_status" character varying(40) NOT NULL DEFAULT 'not_started',
        "tos_status" character varying(40) NOT NULL DEFAULT 'pending',
        "tos_link" text,
        "kyc_link" text,
        "legal_name" character varying(255) NOT NULL,
        "email" character varying(255) NOT NULL,
        "idempotency_key" character varying(64),
        "rejection_reasons" jsonb,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_accounts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_bridge_accounts_user_type" UNIQUE ("user_id", "account_type")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_bridge_accounts_user_id" ON "bridge_accounts" ("user_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "bridge_webhook_events" (
        "event_id" character varying(120) NOT NULL,
        "event_type" character varying(80) NOT NULL,
        "payload" jsonb,
        "processed_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bridge_webhook_events" PRIMARY KEY ("event_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "bridge_webhook_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bridge_accounts"`);
  }
}
