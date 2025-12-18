import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateClientsTable1734384000000 implements MigrationInterface {
  name = 'CreateClientsTable1734384000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Crear tabla clients
    await queryRunner.createTable(
      new Table({
        name: 'clients',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'partner_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'user_id',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'full_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'company',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'address',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'status',
            type: 'boolean',
            default: true,
          },
          {
            name: 'notes',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Crear índices
    await queryRunner.createIndex(
      'clients',
      new TableIndex({
        name: 'idx_clients_partner_id',
        columnNames: ['partner_id'],
      }),
    );

    await queryRunner.createIndex(
      'clients',
      new TableIndex({
        name: 'idx_clients_user_id',
        columnNames: ['user_id'],
      }),
    );

    await queryRunner.createIndex(
      'clients',
      new TableIndex({
        name: 'idx_clients_email',
        columnNames: ['email'],
      }),
    );

    // Crear foreign keys
    await queryRunner.createForeignKey(
      'clients',
      new TableForeignKey({
        columnNames: ['partner_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
        name: 'fk_clients_partner',
      }),
    );

    await queryRunner.createForeignKey(
      'clients',
      new TableForeignKey({
        columnNames: ['user_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'SET NULL',
        name: 'fk_clients_user',
      }),
    );

    // Crear índice único para email por partner (si tiene partner)
    // Nota: PostgreSQL no soporta índices únicos parciales directamente con WHERE
    // Se puede crear un índice único compuesto o manejar la validación a nivel de aplicación
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_clients_email_partner_unique 
      ON clients(email, partner_id) 
      WHERE partner_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS idx_clients_email_partner_unique;`);
    await queryRunner.dropIndex('clients', 'idx_clients_email');
    await queryRunner.dropIndex('clients', 'idx_clients_user_id');
    await queryRunner.dropIndex('clients', 'idx_clients_partner_id');

    // Eliminar foreign keys
    await queryRunner.dropForeignKey('clients', 'fk_clients_user');
    await queryRunner.dropForeignKey('clients', 'fk_clients_partner');

    // Eliminar tabla
    await queryRunner.dropTable('clients');
  }
}

