import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPaymentFieldsToRequests1734567890124
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('requests');
    if (!tableExists) {
      // Esta migración fue creada con un timestamp anterior a la creación de "requests".
      // En instalaciones nuevas, "requests" todavía no existe en este punto.
      // Los campos se añaden más adelante por una migración posterior (idempotente).
      return;
    }

    await queryRunner.addColumns('requests', [
      new TableColumn({
        name: 'payment_method',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'payment_amount',
        type: 'decimal',
        precision: 10,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'stripe_charge_id',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
      new TableColumn({
        name: 'payment_status',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
      new TableColumn({
        name: 'payment_proof_url',
        type: 'text',
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('requests');
    if (!tableExists) return;

    await queryRunner.dropColumns('requests', [
      'payment_method',
      'payment_amount',
      'stripe_charge_id',
      'payment_status',
      'payment_proof_url',
    ]);
  }
}


