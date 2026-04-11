import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Añade users.zoho_contact_id (ID del Contact en Zoho CRM para usuarios partner).
 */
export class AddZohoContactIdToUsers1771350000000 implements MigrationInterface {
  name = 'AddZohoContactIdToUsers1771350000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (table?.findColumnByName('zoho_contact_id')) {
      return;
    }
    await queryRunner.addColumn(
      'users',
      new TableColumn({
        name: 'zoho_contact_id',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('users');
    if (!table?.findColumnByName('zoho_contact_id')) {
      return;
    }
    await queryRunner.dropColumn('users', 'zoho_contact_id');
  }
}
