import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveObsoleteFieldsFromRenovacionLlcRequestsManual1769232500000
  implements MigrationInterface
{
  name = 'RemoveObsoleteFieldsFromRenovacionLlcRequestsManual1769232500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar campos obsoletos de renovacion_llc_requests que no están en la entidad
    const columnsToRemove = [
      'data_is_correct',
      'observations',
      'amount_to_pay',
      'wants_invoice',
      'payment_method', // Este campo debería estar en requests, no en renovacion_llc_requests
      'payment_proof_url', // Este campo debería estar en requests, no en renovacion_llc_requests
    ];

    for (const colName of columnsToRemove) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'renovacion_llc_requests' 
        AND column_name = '${colName}'
      `);

      if (hasColumn && hasColumn.length > 0) {
        await queryRunner.query(`
          ALTER TABLE "renovacion_llc_requests" 
          DROP COLUMN IF EXISTS "${colName}"
        `);
        console.log(`✓ Eliminada columna ${colName} de renovacion_llc_requests`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar campos (solo para rollback, aunque no deberían usarse)
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "data_is_correct" boolean
    `);
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "observations" text
    `);
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "amount_to_pay" numeric(10,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "wants_invoice" boolean
    `);
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "payment_method" character varying(100)
    `);
    await queryRunner.query(`
      ALTER TABLE "renovacion_llc_requests" 
      ADD COLUMN IF NOT EXISTS "payment_proof_url" text
    `);
  }
}
