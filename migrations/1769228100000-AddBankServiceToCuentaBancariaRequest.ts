import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankServiceToCuentaBancariaRequest1769228100000 implements MigrationInterface {
  name = 'AddBankServiceToCuentaBancariaRequest1769228100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna ya existe
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'cuenta_bancaria_requests' 
      AND column_name = 'bank_service'
    `);

    if (!hasColumn || hasColumn.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "cuenta_bancaria_requests" 
        ADD COLUMN "bank_service" character varying(50)
      `);
      console.log('✓ Agregada columna bank_service a cuenta_bancaria_requests');
    } else {
      console.log('✓ La columna bank_service ya existe en cuenta_bancaria_requests');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Verificar si la columna existe antes de eliminarla
    const hasColumn = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'cuenta_bancaria_requests' 
      AND column_name = 'bank_service'
    `);

    if (hasColumn && hasColumn.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "cuenta_bancaria_requests" 
        DROP COLUMN "bank_service"
      `);
      console.log('✓ Eliminada columna bank_service de cuenta_bancaria_requests');
    }
  }
}
