import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveOldIngresosPeriodicosColumn1769229396370 implements MigrationInterface {
  name = 'RemoveOldIngresosPeriodicosColumn1769229396370';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna antigua existe antes de eliminarla
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'apertura_llc_requests' 
      AND column_name = 'ingresos_periodicos_10k'
    `);

    if (hasColumn && hasColumn.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "apertura_llc_requests" 
        DROP COLUMN "ingresos_periodicos_10k"
      `);
      console.log('✓ Eliminada columna antigua ingresos_periodicos_10k de apertura_llc_requests');
    } else {
      console.log('✓ La columna ingresos_periodicos_10k no existe en apertura_llc_requests');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna no existe antes de crearla
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'apertura_llc_requests' 
      AND column_name = 'ingresos_periodicos_10k'
    `);

    if (!hasColumn || hasColumn.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "apertura_llc_requests" 
        ADD COLUMN "ingresos_periodicos_10k" boolean
      `);
      console.log('✓ Restaurada columna ingresos_periodicos_10k en apertura_llc_requests');
    }
  }
}
