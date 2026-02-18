import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class EnsurePaymentFieldsOnRequests1769000500000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('requests');
    if (!tableExists) {
      throw new Error(
        'La tabla "requests" no existe. Esta migración debe ejecutarse después de CreatePanelTables.',
      );
    }

    const table = await queryRunner.getTable('requests');
    if (!table) {
      throw new Error('No se pudo cargar metadata de la tabla "requests".');
    }

    const existing = new Set(table.columns.map((c) => c.name));

    const columnsToAdd: TableColumn[] = [];

    if (!existing.has('payment_method')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'payment_method',
          type: 'varchar',
          length: '50',
          isNullable: true,
        }),
      );
    }

    if (!existing.has('payment_amount')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'payment_amount',
          type: 'decimal',
          precision: 10,
          scale: 2,
          isNullable: true,
        }),
      );
    }

    if (!existing.has('stripe_charge_id')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'stripe_charge_id',
          type: 'varchar',
          length: '100',
          isNullable: true,
        }),
      );
    }

    if (!existing.has('payment_status')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'payment_status',
          type: 'varchar',
          length: '50',
          isNullable: true,
        }),
      );
    }

    if (!existing.has('payment_proof_url')) {
      columnsToAdd.push(
        new TableColumn({
          name: 'payment_proof_url',
          type: 'text',
          isNullable: true,
        }),
      );
    }

    if (columnsToAdd.length > 0) {
      await queryRunner.addColumns('requests', columnsToAdd);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('requests');
    if (!tableExists) return;

    const table = await queryRunner.getTable('requests');
    if (!table) return;

    const existing = new Set(table.columns.map((c) => c.name));
    const colsToDrop = [
      'payment_method',
      'payment_amount',
      'stripe_charge_id',
      'payment_status',
      'payment_proof_url',
    ].filter((c) => existing.has(c));

    if (colsToDrop.length > 0) {
      await queryRunner.dropColumns('requests', colsToDrop);
    }
  }
}

