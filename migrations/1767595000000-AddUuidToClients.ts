import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddUuidToClients1767595000000 implements MigrationInterface {
  name = 'AddUuidToClients1767595000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columna UUID a clients
    await queryRunner.addColumn(
      'clients',
      new TableColumn({
        name: 'uuid',
        type: 'varchar',
        length: '36',
        isNullable: true,
        isUnique: true,
      }),
    );

    // Generar UUIDs para clientes existentes
    await queryRunner.query(`
      UPDATE clients 
      SET uuid = gen_random_uuid()::text 
      WHERE uuid IS NULL;
    `);

    // Hacer la columna UUID NOT NULL después de generar valores
    await queryRunner.query(`
      ALTER TABLE clients 
      ALTER COLUMN uuid SET NOT NULL;
    `);

    // Crear índice único para UUID
    await queryRunner.createIndex(
      'clients',
      new TableIndex({
        name: 'idx_clients_uuid',
        columnNames: ['uuid'],
        isUnique: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índice
    await queryRunner.dropIndex('clients', 'idx_clients_uuid');

    // Eliminar columna UUID
    await queryRunner.dropColumn('clients', 'uuid');
  }
}

