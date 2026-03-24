import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkDriveIdToRequests1771100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'work_drive_id',
        type: 'varchar',
        length: '200',
        isNullable: true,
        comment: 'ID del recurso en Zoho WorkDrive (carpeta/archivo)',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('requests', 'work_drive_id');
  }
}
