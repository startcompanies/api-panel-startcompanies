import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLlcAddressAndEinToAperturaLlcRequest1778000000000
  implements MigrationInterface
{
  name = 'AddLlcAddressAndEinToAperturaLlcRequest1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'apertura_llc_requests';

    const existingColumns = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = '${table}'
    `);
    const columnNames = existingColumns.map((col: { column_name: string }) => col.column_name);

    if (!columnNames.includes('llc_address')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'llc_address',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (!columnNames.includes('ein')) {
      await queryRunner.addColumn(
        table,
        new TableColumn({
          name: 'ein',
          type: 'varchar',
          length: '50',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'apertura_llc_requests';
    await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "ein"`);
    await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "llc_address"`);
  }
}
