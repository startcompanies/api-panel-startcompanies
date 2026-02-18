import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQaTodoToPosts1769305000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'qa_todo',
        type: 'text',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('posts', 'qa_todo');
  }
}
