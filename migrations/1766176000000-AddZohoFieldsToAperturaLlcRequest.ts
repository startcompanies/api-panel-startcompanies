import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddZohoFieldsToAperturaLlcRequest1766176000000
  implements MigrationInterface
{
  name = 'AddZohoFieldsToAperturaLlcRequest1766176000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = 'apertura_llc_requests';

    // Eliminar campos no utilizados (que no están en el mapeo proporcionado)
    const columnsToRemove = [
      'business_type',
      'has_ein',
      'ein_document_url',
      'no_ein_reason',
      'certificate_of_formation_url',
      'registered_agent_address',
      'registered_agent_name',
      'registered_agent_email',
      'registered_agent_phone',
      'registered_agent_type',
      'needs_bank_verification_help',
      'bank_account_type',
      'bank_name',
      'bank_account_number',
      'bank_routing_number',
      'bank_statement_url',
      'owner_nationality',
      'owner_country_of_residence',
      'owner_personal_address',
      'owner_phone_number',
      'owner_email',
      'llc_phone_number', // No está en el mapeo proporcionado
      'llc_email', // No está en el mapeo proporcionado
      'incorporation_date', // No está en el mapeo proporcionado
    ];

    for (const colName of columnsToRemove) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}' AND column_name = '${colName}'
      `);
      
      if (hasColumn && hasColumn.length > 0) {
        // Si tiene constraint, eliminarlo primero
        if (colName === 'registered_agent_type') {
          await queryRunner.query(`
            ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "check_apertura_registered_agent_type"
          `);
        }
        await queryRunner.dropColumn(table, colName);
      }
    }

    // Obtener todos los campos existentes
    const existingColumns = await queryRunner.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = '${table}'
    `);
    const columnNames = existingColumns.map((col: any) => col.column_name);

    // Agregar solo los campos del mapeo proporcionado que no existen
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

    // Eliminar campos nuevos de Zoho
    await queryRunner.dropColumn(table, 'tiene_cuentas_bancarias');
    await queryRunner.dropColumn(table, 'propiedad_en_usa');
    await queryRunner.dropColumn(table, 'contrata_servicios_usa');
    await queryRunner.dropColumn(table, 'ingresos_periodicos_10k');
    await queryRunner.dropColumn(table, 'activos_en_usa');
    await queryRunner.dropColumn(table, 'ingresos_mayor_250k');
    await queryRunner.dropColumn(table, 'llc_con_start_companies');
    await queryRunner.dropColumn(table, 'declaro_impuestos_antes');
    await queryRunner.dropColumn(table, 'almacena_productos_deposito_usa');
    await queryRunner.dropColumn(table, 'actividad_financiera_esperada');
    await queryRunner.dropColumn(table, 'linkedin');
    await queryRunner.dropColumn(table, 'website');
    await queryRunner.dropColumn(table, 'estado_constitucion');
    await queryRunner.dropColumn(table, 'account_type');
    await queryRunner.dropColumn(table, 'annual_revenue');
    await queryRunner.dropColumn(table, 'llc_name_option_3');
    await queryRunner.dropColumn(table, 'llc_name_option_2');

    // Restaurar campos eliminados (revertir cambios)
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'llc_website',
        type: 'varchar',
        length: '500',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'owner_email',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'owner_phone_number',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'owner_personal_address',
        type: 'jsonb',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'owner_country_of_residence',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'owner_nationality',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'bank_statement_url',
        type: 'text',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'bank_routing_number',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'bank_account_number',
        type: 'varchar',
        length: '100',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'bank_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'bank_account_type',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'needs_bank_verification_help',
        type: 'boolean',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'registered_agent_type',
        type: 'varchar',
        length: '20',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'registered_agent_phone',
        type: 'varchar',
        length: '50',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'registered_agent_email',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'registered_agent_name',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'registered_agent_address',
        type: 'jsonb',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'certificate_of_formation_url',
        type: 'text',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'no_ein_reason',
        type: 'text',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'ein_document_url',
        type: 'text',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'has_ein',
        type: 'boolean',
        isNullable: true,
      }),
    );
    await queryRunner.addColumn(
      table,
      new TableColumn({
        name: 'business_type',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );
  }
}
