import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCompanyToRequests1769227800000 implements MigrationInterface {
  name = 'AddCompanyToRequests1769227800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna ya existe
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'requests' 
      AND column_name = 'company'
    `);

    if (!hasColumn || hasColumn.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "requests" 
        ADD COLUMN "company" character varying(255)
      `);
      console.log('✓ Agregada columna company a requests');
    } else {
      console.log('✓ La columna company ya existe en requests');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna existe antes de eliminarla
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'requests' 
      AND column_name = 'company'
    `);

    if (hasColumn && hasColumn.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "requests" 
        DROP COLUMN "company"
      `);
      console.log('✓ Eliminada columna company de requests');
    }
  }
}
