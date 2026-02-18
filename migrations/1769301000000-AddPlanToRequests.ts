import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddPlanToRequests1769301000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'plan',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('requests', 'plan');
  }
}
