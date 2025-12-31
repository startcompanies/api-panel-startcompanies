import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddWebsiteFieldToAperturaLlcRequest1766177000000
  implements MigrationInterface
{
  name = 'AddWebsiteFieldToAperturaLlcRequest1766177000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'apertura_llc_requests';

    // Obtener todos los campos existentes
    const existingColumns = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${table}'
    `);
    const columnNames = existingColumns.map((col: any) => col.column_name);

    // Lista de todos los campos nuevos que deben existir
    const columnsToAdd = [
      { name: 'llc_name_option_2', type: 'varchar', length: '255' },
      { name: 'llc_name_option_3', type: 'varchar', length: '255' },
      { name: 'annual_revenue', type: 'decimal', precision: 15, scale: 2 },
      { name: 'account_type', type: 'varchar', length: '50' },
      { name: 'estado_constitucion', type: 'varchar', length: '100' },
      { name: 'website', type: 'varchar', length: '500' },
      { name: 'linkedin', type: 'varchar', length: '255' },
      { name: 'actividad_financiera_esperada', type: 'text' },
      { name: 'almacena_productos_deposito_usa', type: 'boolean' },
      { name: 'declaro_impuestos_antes', type: 'boolean' },
      { name: 'llc_con_start_companies', type: 'boolean' },
      { name: 'ingresos_mayor_250k', type: 'boolean' },
      { name: 'activos_en_usa', type: 'boolean' },
      { name: 'ingresos_periodicos_10k', type: 'boolean' },
      { name: 'contrata_servicios_usa', type: 'boolean' },
      { name: 'propiedad_en_usa', type: 'boolean' },
      { name: 'tiene_cuentas_bancarias', type: 'boolean' },
    ];

    // Agregar solo los campos que no existen
    for (const col of columnsToAdd) {
      if (!columnNames.includes(col.name)) {
        await queryRunner.addColumn(
          table,
          new TableColumn({
            name: col.name,
            type: col.type as any,
            length: col.length,
            precision: (col as any).precision,
            scale: (col as any).scale,
            isNullable: true,
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = 'apertura_llc_requests';
    
    // Eliminar todos los campos nuevos
    const columnsToRemove = [
      'tiene_cuentas_bancarias',
      'propiedad_en_usa',
      'contrata_servicios_usa',
      'ingresos_periodicos_10k',
      'activos_en_usa',
      'ingresos_mayor_250k',
      'llc_con_start_companies',
      'declaro_impuestos_antes',
      'almacena_productos_deposito_usa',
      'actividad_financiera_esperada',
      'linkedin',
      'website',
      'estado_constitucion',
      'account_type',
      'annual_revenue',
      'llc_name_option_3',
      'llc_name_option_2',
    ];

    for (const colName of columnsToRemove) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = '${colName}'
      `);
      
      if (hasColumn && hasColumn.length > 0) {
        await queryRunner.dropColumn(table, colName);
      }
    }
  }
}





