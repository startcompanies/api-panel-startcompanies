import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddCreatedFromToRequests1769000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'created_from',
        type: 'varchar',
        length: '20',
        isNullable: false,
        default: "'panel'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('requests', 'created_from');
  }
}

