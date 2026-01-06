import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCurrentStepToRequests1767595500000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'current_step',
        type: 'int',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('requests', 'current_step');
  }
}
