import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixCheckRequestsStatusConstraint1767645000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar si el constraint existe y actualizarlo
    // Primero eliminamos el constraint si existe (con ambos nombres posibles por si acaso)
    await queryRunner.query(`
      ALTER TABLE requests 
      DROP CONSTRAINT IF EXISTS check_requests_status;
    `);

    await queryRunner.query(`
      ALTER TABLE requests 
      DROP CONSTRAINT IF EXISTS requests_status_check;
    `);

    // Crear el constraint con el nombre correcto y los valores actualizados
    await queryRunner.query(`
      ALTER TABLE requests 
      ADD CONSTRAINT check_requests_status 
      CHECK (status IN ('solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir el constraint a los valores anteriores
    await queryRunner.query(`
      ALTER TABLE requests 
      DROP CONSTRAINT IF EXISTS check_requests_status;
    `);

    await queryRunner.query(`
      ALTER TABLE requests 
      ADD CONSTRAINT check_requests_status 
      CHECK (status IN ('pendiente', 'en-proceso', 'completada', 'rechazada'));
    `);
  }
}

