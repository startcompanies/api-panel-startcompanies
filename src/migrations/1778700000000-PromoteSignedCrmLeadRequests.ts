import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Solicitudes con firma guardada pero status pendiente (crm-lead sin pago y wizard con pago).
 */
export class PromoteSignedCrmLeadRequests1778700000000 implements MigrationInterface {
  name = 'PromoteSignedCrmLeadRequests1778700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "requests"
      SET "status" = 'solicitud-recibida'
      WHERE "status" = 'pendiente'
        AND "signature_url" IS NOT NULL
        AND TRIM("signature_url") <> ''
        AND (
          (
            "created_from" = 'crm-lead'
            AND "stripe_charge_id" IS NULL
            AND (
              "payment_method" IS NULL
              OR "payment_status" = 'not_required'
            )
          )
          OR "created_from" = 'wizard'
        )
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No revertir: no hay forma fiable de saber cuáles eran pendiente antes.
  }
}
