import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateZohoConfigTable1766095300000 implements MigrationInterface {
  name = 'CreateZohoConfigTable1766095300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'zoho_config',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'org',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'service',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'region',
            type: 'varchar',
            length: '3',
            isNullable: false,
          },
          {
            name: 'scopes',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'client_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'client_secret',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'refresh_token',
            type: 'varchar',
            length: '255',
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

    // Crear índice único compuesto para org y service
    await queryRunner.createIndex(
      'zoho_config',
      new TableIndex({
        name: 'idx_zoho_config_org_service',
        columnNames: ['org', 'service'],
        isUnique: true,
      }),
    );

    // Crear índice para región
    await queryRunner.createIndex(
      'zoho_config',
      new TableIndex({
        name: 'idx_zoho_config_region',
        columnNames: ['region'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar índices
    await queryRunner.dropIndex('zoho_config', 'idx_zoho_config_region');
    await queryRunner.dropIndex('zoho_config', 'idx_zoho_config_org_service');

    // Eliminar tabla
    await queryRunner.dropTable('zoho_config');
  }
}





