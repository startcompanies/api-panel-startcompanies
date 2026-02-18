import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFileUrlFieldsToRenovacionLlcRequest1769228000000 implements MigrationInterface {
  name = 'AddFileUrlFieldsToRenovacionLlcRequest1769228000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Agregar campos de archivos URL a renovacion_llc_requests si no existen
    const fileUrlColumns = [
      { name: 'partners_passports_file_url', type: 'text' },
      { name: 'operating_agreement_additional_file_url', type: 'text' },
      { name: 'form_147_or_575_file_url', type: 'text' },
      { name: 'articles_of_organization_additional_file_url', type: 'text' },
      { name: 'boi_report_file_url', type: 'text' },
      { name: 'bank_statements_file_url', type: 'text' },
    ];

    for (const col of fileUrlColumns) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'renovacion_llc_requests' 
        AND column_name = '${col.name}'
      `);

      if (!hasColumn || hasColumn.length === 0) {
        await queryRunner.query(`
          ALTER TABLE "renovacion_llc_requests" 
          ADD COLUMN "${col.name}" ${col.type}
        `);
        console.log(`✓ Agregada columna ${col.name} a renovacion_llc_requests`);
      } else {
        console.log(`✓ La columna ${col.name} ya existe en renovacion_llc_requests`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar campos de archivos URL de renovacion_llc_requests
    const fileUrlColumns = [
      'partners_passports_file_url',
      'operating_agreement_additional_file_url',
      'form_147_or_575_file_url',
      'articles_of_organization_additional_file_url',
      'boi_report_file_url',
      'bank_statements_file_url',
    ];

    for (const colName of fileUrlColumns) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'renovacion_llc_requests' 
        AND column_name = '${colName}'
      `);

      if (hasColumn && hasColumn.length > 0) {
        await queryRunner.query(`
          ALTER TABLE "renovacion_llc_requests" 
          DROP COLUMN "${colName}"
        `);
        console.log(`✓ Eliminada columna ${colName} de renovacion_llc_requests`);
      }
    }
  }
}
