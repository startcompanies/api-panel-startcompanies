import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convierte llc_address de jsonb a text si la migración anterior lo creó como jsonb.
 */
export class ChangeLlcAddressToText1778100000000 implements MigrationInterface {
  name = 'ChangeLlcAddressToText1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ data_type: string }> = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'apertura_llc_requests' AND column_name = 'llc_address'
    `);

    if (rows.length === 0 || rows[0].data_type === 'text') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "apertura_llc_requests"
      ALTER COLUMN "llc_address" TYPE text
      USING (
        CASE
          WHEN "llc_address" IS NULL THEN NULL
          WHEN jsonb_typeof("llc_address") = 'string' THEN trim("llc_address" #>> '{}')
          ELSE NULLIF(trim(both ', ' from concat_ws(
            ', ',
            NULLIF(trim("llc_address"->>'street'), ''),
            NULLIF(trim("llc_address"->>'city'), ''),
            NULLIF(trim("llc_address"->>'state'), ''),
            NULLIF(trim("llc_address"->>'zipCode'), ''),
            NULLIF(trim("llc_address"->>'country'), '')
          )), '')
        END
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const rows: Array<{ data_type: string }> = await queryRunner.query(`
      SELECT data_type
      FROM information_schema.columns
      WHERE table_name = 'apertura_llc_requests' AND column_name = 'llc_address'
    `);

    if (rows.length === 0 || rows[0].data_type !== 'text') {
      return;
    }

    await queryRunner.query(`
      ALTER TABLE "apertura_llc_requests"
      ALTER COLUMN "llc_address" TYPE jsonb
      USING (
        CASE
          WHEN "llc_address" IS NULL OR trim("llc_address") = '' THEN NULL
          ELSE jsonb_build_object('street', trim("llc_address"))
        END
      )
    `);
  }
}
