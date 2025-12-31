import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddZohoAccountIdToRequests1766095400000 implements MigrationInterface {
  name = 'AddZohoAccountIdToRequests1766095400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'zoho_account_id',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );

    // Crear índice para búsquedas rápidas
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_requests_zoho_account_id 
      ON requests(zoho_account_id)
      WHERE zoho_account_id IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_requests_zoho_account_id;`);
    await queryRunner.dropColumn('requests', 'zoho_account_id');
  }
}





