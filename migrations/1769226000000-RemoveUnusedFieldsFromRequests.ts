import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveUnusedFieldsFromRequests1769226000000
  implements MigrationInterface
{
  name = 'RemoveUnusedFieldsFromRequests1769226000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar campos de apertura_llc_requests que NO están en el CSV del formulario
    const aperturaColumnsToRemove = [
      'annual_revenue',
      'account_type',
      'estado_constitucion',
      'website', // No está en CSV, projectOrCompanyUrl es el campo correcto
      'almacena_productos_deposito_usa', // No está en CSV para apertura
      'declaro_impuestos_antes', // No está en CSV
      'llc_con_start_companies', // No está en CSV
      'ingresos_mayor_250k', // No está en CSV
      'activos_en_usa', // No está en CSV
      'contrata_servicios_usa', // No está en CSV para apertura
      'propiedad_en_usa', // No está en CSV para apertura
      'tiene_cuentas_bancarias', // No está en CSV para apertura
      'ein_number', // No está en CSV de apertura-llc
    ];

    for (const colName of aperturaColumnsToRemove) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'apertura_llc_requests' 
        AND column_name = '${colName}'
      `);

      if (hasColumn && hasColumn.length > 0) {
        await queryRunner.query(`
          ALTER TABLE "apertura_llc_requests" 
          DROP COLUMN IF EXISTS "${colName}"
        `);
        console.log(`✓ Eliminada columna ${colName} de apertura_llc_requests`);
      }
    }

    // Eliminar campos de renovacion_llc_requests que NO están en el CSV del formulario
    const renovacionColumnsToRemove = [
      'declaracion_inicial', // No está en CSV
      'cambio_direccion_ra', // No está en CSV
      'agregar_cambiar_socio', // No está en CSV
      'declaracion_cierre', // No está en CSV
      // NOTA: Los campos de archivos (partners_passports_file_url, etc.) se mantienen porque se usan en el frontend
    ];

    for (const colName of renovacionColumnsToRemove) {
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
          DROP COLUMN IF EXISTS "${colName}"
        `);
        console.log(`✓ Eliminada columna ${colName} de renovacion_llc_requests`);
      }
    }

    // Eliminar campos de cuenta_bancaria_requests que NO están en el CSV del formulario
    // NOTA: account_type NO se elimina porque se usa para calcular el monto de pago (gratuita/premium)
    // NOTA: Los campos de archivos (URLs) y validator (que se transforman a Member) se mantienen porque se usan en el frontend
    const cuentaColumnsToRemove = [
      'bank_name',
      'first_registration_date',
      'applicant_email', // No está en CSV (se usa Member)
      'applicant_first_name', // No está en CSV (se usa Member)
      'applicant_paternal_last_name', // No está en CSV (se usa Member)
      'applicant_maternal_last_name', // No está en CSV (se usa Member)
      'applicant_phone', // No está en CSV (se usa Member)
      'is_registered_agent_in_usa', // No está en CSV
      'registered_agent_name', // No está en CSV
      'registered_agent_address', // No está en CSV (se usa companyAddress JSONB)
      'swift_bic_aba', // No está en CSV
      'account_number', // No está en CSV
      'bank_account_type', // No está en CSV
      'has_litigated_current_fiscal_year', // No está en CSV
      'litigation_details', // No está en CSV
      'is_same_address_as_business', // No está en CSV
      // NOTA: proof_of_address_url NO se elimina porque es un campo de archivo
      'document_certification', // No está en CSV
      'accepts_terms_and_conditions', // No está en CSV
      'validator_citizenship', // No está en CSV (no se transforma a Member)
      'validator_use_email_for_relay_login', // No está en CSV
      'validator_can_receive_sms', // No está en CSV (no se transforma a Member)
      'validator_title', // No está en CSV (no se transforma a Member)
      'validator_income_source', // No está en CSV (no se transforma a Member)
      'validator_annual_income', // No está en CSV (no se transforma a Member)
    ];

    for (const colName of cuentaColumnsToRemove) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cuenta_bancaria_requests' 
        AND column_name = '${colName}'
      `);

      if (hasColumn && hasColumn.length > 0) {
        await queryRunner.query(`
          ALTER TABLE "cuenta_bancaria_requests" 
          DROP COLUMN IF EXISTS "${colName}"
        `);
        console.log(`✓ Eliminada columna ${colName} de cuenta_bancaria_requests`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurar campos de apertura_llc_requests
    const aperturaColumnsToRestore = [
      { name: 'annual_revenue', type: 'decimal', precision: 15, scale: 2 },
      { name: 'account_type', type: 'varchar', length: 50 },
      { name: 'estado_constitucion', type: 'varchar', length: 100 },
      { name: 'website', type: 'varchar', length: 500 },
      { name: 'almacena_productos_deposito_usa', type: 'boolean' },
      { name: 'declaro_impuestos_antes', type: 'boolean' },
      { name: 'llc_con_start_companies', type: 'boolean' },
      { name: 'ingresos_mayor_250k', type: 'boolean' },
      { name: 'activos_en_usa', type: 'boolean' },
      { name: 'contrata_servicios_usa', type: 'boolean' },
      { name: 'propiedad_en_usa', type: 'boolean' },
      { name: 'tiene_cuentas_bancarias', type: 'boolean' },
      { name: 'ein_number', type: 'varchar', length: 50 },
    ];

    for (const col of aperturaColumnsToRestore) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'apertura_llc_requests' 
        AND column_name = '${col.name}'
      `);

      if (!hasColumn || hasColumn.length === 0) {
        if (col.type === 'decimal') {
          await queryRunner.query(`
            ALTER TABLE "apertura_llc_requests" 
            ADD COLUMN "${col.name}" ${col.type}(${col.precision}, ${col.scale})
          `);
        } else {
          await queryRunner.query(`
            ALTER TABLE "apertura_llc_requests" 
            ADD COLUMN "${col.name}" ${col.type}(${col.length})
          `);
        }
        console.log(`✓ Restaurada columna ${col.name} en apertura_llc_requests`);
      }
    }

    // Restaurar campos de renovacion_llc_requests
    const renovacionColumnsToRestore = [
      { name: 'declaracion_inicial', type: 'boolean' },
      { name: 'cambio_direccion_ra', type: 'boolean' },
      { name: 'agregar_cambiar_socio', type: 'boolean' },
      { name: 'declaracion_cierre', type: 'boolean' },
    ];

    for (const col of renovacionColumnsToRestore) {
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
        console.log(`✓ Restaurada columna ${col.name} en renovacion_llc_requests`);
      }
    }

    // Restaurar campos de cuenta_bancaria_requests
    const cuentaColumnsToRestore = [
      { name: 'bank_name', type: 'varchar', length: 255 },
      { name: 'first_registration_date', type: 'date' },
      { name: 'applicant_email', type: 'varchar', length: 255 },
      { name: 'applicant_first_name', type: 'varchar', length: 255 },
      { name: 'applicant_paternal_last_name', type: 'varchar', length: 255 },
      { name: 'applicant_maternal_last_name', type: 'varchar', length: 255 },
      { name: 'applicant_phone', type: 'varchar', length: 50 },
      { name: 'is_registered_agent_in_usa', type: 'boolean' },
      { name: 'registered_agent_name', type: 'varchar', length: 255 },
      { name: 'registered_agent_address', type: 'text' },
      { name: 'swift_bic_aba', type: 'varchar', length: 50 },
      { name: 'account_number', type: 'varchar', length: 100 },
      { name: 'bank_account_type', type: 'varchar', length: 50 },
      { name: 'has_litigated_current_fiscal_year', type: 'boolean' },
      { name: 'litigation_details', type: 'text' },
      { name: 'is_same_address_as_business', type: 'boolean' },
      // NOTA: proof_of_address_url NO se restaura porque es un campo de archivo que se mantiene
      { name: 'document_certification', type: 'text' },
      { name: 'accepts_terms_and_conditions', type: 'boolean' },
      { name: 'validator_citizenship', type: 'varchar', length: 100 },
      { name: 'validator_use_email_for_relay_login', type: 'boolean' },
      { name: 'validator_can_receive_sms', type: 'boolean' },
      { name: 'validator_title', type: 'varchar', length: 255 },
      { name: 'validator_income_source', type: 'varchar', length: 255 },
      { name: 'validator_annual_income', type: 'numeric', precision: 15, scale: 2 },
    ];

    for (const col of cuentaColumnsToRestore) {
      const hasColumn = await queryRunner.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'cuenta_bancaria_requests' 
        AND column_name = '${col.name}'
      `);

      if (!hasColumn || hasColumn.length === 0) {
        if (col.type === 'date') {
          await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "${col.name}" ${col.type}
          `);
        } else {
          await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests" 
            ADD COLUMN "${col.name}" ${col.type}(${col.length})
          `);
        }
        console.log(`✓ Restaurada columna ${col.name} en cuenta_bancaria_requests`);
      }
    }
  }
}
