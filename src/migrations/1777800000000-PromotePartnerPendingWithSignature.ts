import { MigrationInterface, QueryRunner } from 'typeorm';

const BACKUP_TABLE = 'requests_partner_signature_promote_backup_1777800000000';

/**
 * Solicitudes de partner que quedaron en borrador (pendiente) pese a tener firma
 * de confirmación en el paso final: deben estar en solicitud-recibida (flujo correcto).
 */
export class PromotePartnerPendingWithSignature1777800000000 implements MigrationInterface {
  name = 'PromotePartnerPendingWithSignature1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
        request_id INT PRIMARY KEY,
        previous_status VARCHAR(50) NOT NULL,
        promoted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      INSERT INTO ${BACKUP_TABLE} (request_id, previous_status)
      SELECT id, status
      FROM requests
      WHERE status = 'pendiente'
        AND partner_id IS NOT NULL
        AND signature_url IS NOT NULL
        AND TRIM(signature_url) <> ''
      ON CONFLICT (request_id) DO NOTHING;
    `);

    await queryRunner.query(`
      UPDATE requests r
      SET status = 'solicitud-recibida',
          "updatedAt" = NOW()
      FROM ${BACKUP_TABLE} b
      WHERE r.id = b.request_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE requests r
      SET status = b.previous_status,
          "updatedAt" = NOW()
      FROM ${BACKUP_TABLE} b
      WHERE r.id = b.request_id
        AND r.status = 'solicitud-recibida';
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE};`);
  }
}
