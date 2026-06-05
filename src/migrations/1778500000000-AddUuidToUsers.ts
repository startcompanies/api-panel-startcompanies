import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

/**
 * Añade users.uuid para rutas públicas de partners/tenants (sin exponer id numérico).
 * Backfill con gen_random_uuid() para todos los usuarios existentes.
 */
export class AddUuidToUsers1778500000000 implements MigrationInterface {
  name = 'AddUuidToUsers1778500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table?.findColumnByName('uuid')) {
      await queryRunner.addColumn(
        'users',
        new TableColumn({
          name: 'uuid',
          type: 'varchar',
          length: '36',
          isNullable: true,
          isUnique: true,
        }),
      );
    }

    await queryRunner.query(`
      UPDATE users
      SET uuid = gen_random_uuid()::text
      WHERE uuid IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE users
      ALTER COLUMN uuid SET NOT NULL;
    `);

    const tableAfter = await queryRunner.getTable('users');
    if (!tableAfter?.indices.some((i) => i.name === 'idx_users_uuid')) {
      await queryRunner.createIndex(
        'users',
        new TableIndex({
          name: 'idx_users_uuid',
          columnNames: ['uuid'],
          isUnique: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table?.indices.some((i) => i.name === 'idx_users_uuid')) {
      await queryRunner.dropIndex('users', 'idx_users_uuid');
    }
    if (table?.findColumnByName('uuid')) {
      await queryRunner.dropColumn('users', 'uuid');
    }
  }
}
