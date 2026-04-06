import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Añade clients.zoho_contact_id (ID del Contact en Zoho CRM para clientes directos).
 */
export class AddZohoContactIdToClients1743950400000 implements MigrationInterface {
  name = 'AddZohoContactIdToClients1743950400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('clients');
    if (table?.findColumnByName('zoho_contact_id')) {
      return;
    }
    await queryRunner.addColumn(
      'clients',
      new TableColumn({
        name: 'zoho_contact_id',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('clients');
    if (!table?.findColumnByName('zoho_contact_id')) {
      return;
    }
    await queryRunner.dropColumn('clients', 'zoho_contact_id');
  }
}
