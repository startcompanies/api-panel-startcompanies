import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Elimina solicitudes con status='pendiente' creadas hace más de 72 horas.
 * Limpieza one-shot al desplegar la migración.
 */
export class DeleteStalePendingRequests1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Obtenemos los IDs de las solicitudes pendientes a eliminar
    await queryRunner.query(`
      CREATE TEMP TABLE stale_request_ids AS
      SELECT id FROM requests
      WHERE status = 'pendiente'
        AND "createdAt" < NOW() - INTERVAL '72 hours'
    `);

    // Eliminamos los registros hijo que no tienen onDelete CASCADE
    await queryRunner.query(`
      DELETE FROM apertura_llc_requests
      WHERE request_id IN (SELECT id FROM stale_request_ids)
    `);
    await queryRunner.query(`
      DELETE FROM renovacion_llc_requests
      WHERE request_id IN (SELECT id FROM stale_request_ids)
    `);
    await queryRunner.query(`
      DELETE FROM cuenta_bancaria_requests
      WHERE request_id IN (SELECT id FROM stale_request_ids)
    `);

    // Ahora eliminamos los registros padre
    await queryRunner.query(`
      DELETE FROM requests
      WHERE id IN (SELECT id FROM stale_request_ids)
    `);

    await queryRunner.query(`DROP TABLE stale_request_ids`);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No reversible: los datos eliminados no se pueden restaurar
  }
}
