import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddDescriptionAndTimestampsToBlog1769303000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // posts: description + createdAt + updatedAt
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'description',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'createdAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );
    await queryRunner.addColumn(
      'posts',
      new TableColumn({
        name: 'updatedAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );

    // categories: description + createdAt + updatedAt
    await queryRunner.addColumn(
      'categories',
      new TableColumn({
        name: 'description',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      'categories',
      new TableColumn({
        name: 'createdAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );
    await queryRunner.addColumn(
      'categories',
      new TableColumn({
        name: 'updatedAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );

    // tags: createdAt + updatedAt
    await queryRunner.addColumn(
      'tags',
      new TableColumn({
        name: 'createdAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );
    await queryRunner.addColumn(
      'tags',
      new TableColumn({
        name: 'updatedAt',
        type: 'timestamp',
        default: 'CURRENT_TIMESTAMP',
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('posts', 'description');
    await queryRunner.dropColumn('posts', 'createdAt');
    await queryRunner.dropColumn('posts', 'updatedAt');
    await queryRunner.dropColumn('categories', 'description');
    await queryRunner.dropColumn('categories', 'createdAt');
    await queryRunner.dropColumn('categories', 'updatedAt');
    await queryRunner.dropColumn('tags', 'createdAt');
    await queryRunner.dropColumn('tags', 'updatedAt');
  }
}
