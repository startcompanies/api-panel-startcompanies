import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddUuidToRequests1767595100000 implements MigrationInterface {
  name = 'AddUuidToRequests1767595100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columna UUID a requests
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'uuid',
        type: 'varchar',
        length: '36',
        isNullable: true,
        isUnique: true,
      }),
    );

    // Generar UUIDs para requests existentes
    await queryRunner.query(`
      UPDATE requests 
      SET uuid = gen_random_uuid()::text 
      WHERE uuid IS NULL;
    `);

    // Hacer la columna UUID NOT NULL después de generar valores
    await queryRunner.query(`
      ALTER TABLE requests 
      ALTER COLUMN uuid SET NOT NULL;
    `);

    // Crear índice único para UUID
    await queryRunner.createIndex(
      'requests',
      new TableIndex({
        name: 'idx_requests_uuid',
        columnNames: ['uuid'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índice
    await queryRunner.dropIndex('requests', 'idx_requests_uuid');

    // Eliminar columna UUID
    await queryRunner.dropColumn('requests', 'uuid');
  }
}

