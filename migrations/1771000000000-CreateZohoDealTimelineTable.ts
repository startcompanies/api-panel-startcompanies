import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateZohoDealTimelineTable1771000000000 implements MigrationInterface {
  name = 'CreateZohoDealTimelineTable1771000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "zoho_deal_timeline" (
        "id" SERIAL NOT NULL,
        "zoho_deal_id" VARCHAR(50) NOT NULL,
        "deal_name" VARCHAR(500),
        "deal_type" VARCHAR(100),
        "stage" VARCHAR(200),
        "status" VARCHAR(200),
        "zoho_account_id" VARCHAR(50),
        "account_name" VARCHAR(500),
        "zoho_llc_principal_id" VARCHAR(50),
        "llc_principal_name" VARCHAR(500),
        "zoho_contact_id" VARCHAR(50),
        "contact_email" VARCHAR(255),
        "contact_first_name" VARCHAR(255),
        "contact_last_name" VARCHAR(255),
        "tipo_contacto" VARCHAR(100),
        "partner_picklist" VARCHAR(200),
        "amount" DECIMAL(14,2),
        "closing_date" TIMESTAMP WITH TIME ZONE,
        "fecha" TIMESTAMP WITH TIME ZONE,
        "fecha_constitucion" TIMESTAMP WITH TIME ZONE,
        "fecha_renovacion" TIMESTAMP WITH TIME ZONE,
        "created_time_zoho" TIMESTAMP WITH TIME ZONE,
        "modified_time_zoho" TIMESTAMP WITH TIME ZONE,
        "client_id" INTEGER,
        "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_zoho_deal_timeline" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_zoho_deal_timeline_zoho_deal_id" UNIQUE ("zoho_deal_id"),
        CONSTRAINT "FK_zoho_deal_timeline_client" FOREIGN KEY ("client_id")
          REFERENCES "clients"("id") ON DELETE SET NULL
      );
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_zoho_deal_timeline_client_id" ON "zoho_deal_timeline" ("client_id");`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "zoho_deal_timeline" CASCADE;`);
  }
}
