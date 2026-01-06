import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWorkDriveUrlExternalToRequests1766210000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar columna work_drive_url_external para almacenar la URL externa de Zoho WorkDrive
    await queryRunner.addColumn(
      'requests',
      new TableColumn({
        name: 'work_drive_url_external',
        type: 'text',
        isNullable: true,
        comment: 'URL externa de Zoho WorkDrive desde Account',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar columna work_drive_url_external
    await queryRunner.dropColumn('requests', 'work_drive_url_external');
  }
}


