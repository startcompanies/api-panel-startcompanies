import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveValidatorFieldsFromCuentaBancariaRequests1769234202137
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar campos del validator de cuenta_bancaria_requests
    // Estos campos ahora se guardan en la tabla members
    const validatorColumnsToRemove = [
      'validator_first_name',
      'validator_last_name',
      'validator_date_of_birth',
      'validator_nationality',
      'validator_passport_number',
      'validator_scanned_passport_url',
      'validator_work_email',
      'validator_phone',
      'validator_is_us_resident',
    ];

    for (const colName of validatorColumnsToRemove) {
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
    // Revertir eliminación de campos del validator
    // NOTA: Esta reversión recrea los campos con tipos básicos
    // Si necesitas tipos específicos, deberías ajustarlos según los tipos originales
    
    await queryRunner.query(`
      ALTER TABLE "cuenta_bancaria_requests" 
      ADD COLUMN IF NOT EXISTS "validator_first_name" character varying(255),
      ADD COLUMN IF NOT EXISTS "validator_last_name" character varying(255),
      ADD COLUMN IF NOT EXISTS "validator_date_of_birth" date,
      ADD COLUMN IF NOT EXISTS "validator_nationality" character varying(100),
      ADD COLUMN IF NOT EXISTS "validator_passport_number" character varying(100),
      ADD COLUMN IF NOT EXISTS "validator_scanned_passport_url" text,
      ADD COLUMN IF NOT EXISTS "validator_work_email" character varying(255),
      ADD COLUMN IF NOT EXISTS "validator_phone" character varying(50),
      ADD COLUMN IF NOT EXISTS "validator_is_us_resident" boolean
    `);
    console.log('⚠ Campos del validator recreados (reversión)');
  }
}
