import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddQaReviewedToPosts1769302000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'qa_reviewed',
        type: 'boolean',
        default: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('posts', 'qa_reviewed');
  }
}
