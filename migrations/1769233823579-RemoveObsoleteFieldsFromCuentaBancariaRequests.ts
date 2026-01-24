import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveObsoleteFieldsFromCuentaBancariaRequests1769233823579
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar campos obsoletos de cuenta_bancaria_requests que no están en el CSV del formulario
    const columnsToRemove = [
      'applicant_email',
      'applicant_first_name',
      'applicant_paternal_last_name',
      'applicant_maternal_last_name',
      'applicant_phone',
      'account_type', // Aunque se usa para calcular monto, no está en el CSV del formulario
      'is_registered_agent_in_usa',
      'registered_agent_name',
      'registered_agent_address',
      'swift_bic_aba',
      'account_number',
      'bank_account_type',
      'has_litigated_current_fiscal_year',
      'litigation_details',
      'is_same_address_as_business',
      'document_certification',
      'accepts_terms_and_conditions',
      'validator_citizenship',
      'validator_use_email_for_relay_login',
      'validator_can_receive_sms',
      'validator_title',
      'validator_income_source',
      'validator_annual_income',
    ];

    for (const colName of columnsToRemove) {
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
      } else {
        console.log(`⚠ Columna ${colName} no existe en cuenta_bancaria_requests`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir eliminación de campos (solo los que realmente se eliminaron)
    // NOTA: No todos los campos se pueden recrear fácilmente sin conocer sus tipos originales
    // Esta es una migración de limpieza, por lo que el down() puede quedar vacío o recrear solo los campos críticos
    
    // Si necesitas revertir, deberías recrear los campos con sus tipos originales
    // Por ahora, dejamos el down() vacío ya que estos campos no deberían existir
    console.log('⚠ Reversión de RemoveObsoleteFieldsFromCuentaBancariaRequests no implementada');
  }
}
