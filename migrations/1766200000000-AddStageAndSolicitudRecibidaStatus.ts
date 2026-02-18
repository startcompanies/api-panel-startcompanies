import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStageAndSolicitudRecibidaStatus1766200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columna stage para almacenar la etapa actual del blueprint
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'stage',
        type: 'varchar',
        length: '100',
        isNullable: true,
        comment: 'Etapa actual del blueprint de Zoho CRM',
      }),
    );

    // Actualizar el tipo de la columna status para incluir 'solicitud-recibida'
    // Primero verificamos si hay datos con el valor antiguo y los migramos
    await queryRunner.query(`
      DO $$ 
      BEGIN
        -- Si hay registros con 'pendiente', los cambiamos a 'solicitud-recibida'
        IF EXISTS (SELECT 1 FROM requests WHERE status = 'pendiente') THEN
          UPDATE requests SET status = 'solicitud-recibida' WHERE status = 'pendiente';
        END IF;
      END $$;
    `);

    // Modificar el tipo de la columna status
    await queryRunner.query(`
      ALTER TABLE requests 
      DROP CONSTRAINT IF EXISTS check_requests_status;
    `);

    await queryRunner.query(`
      ALTER TABLE requests 
      ADD CONSTRAINT check_requests_status 
      CHECK (status IN ('solicitud-recibida', 'pendiente', 'en-proceso', 'completada', 'rechazada'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir los cambios de status
    await queryRunner.query(`
      UPDATE requests SET status = 'pendiente' WHERE status = 'solicitud-recibida';
    `);

    await queryRunner.query(`
      ALTER TABLE requests 
      DROP CONSTRAINT IF EXISTS check_requests_status;
    `);

    await queryRunner.query(`
      ALTER TABLE requests 
      ADD CONSTRAINT check_requests_status 
      CHECK (status IN ('pendiente', 'en-proceso', 'completada', 'rechazada'));
    `);

    // Eliminar columna stage
    await queryRunner.dropColumn('requests', 'stage');
  }
}


