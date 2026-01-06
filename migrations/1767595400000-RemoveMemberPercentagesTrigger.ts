import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveMemberPercentagesTrigger1767595400000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar el trigger
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS check_member_percentages ON members
    `);

    // Eliminar la función
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS validate_member_percentages()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: recrear la función y el trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION validate_member_percentages()
      RETURNS TRIGGER AS $$
      DECLARE
        total_percentage DECIMAL(5,2);
      BEGIN
        SELECT COALESCE(SUM(percentage_of_participation), 0)
        INTO total_percentage
        FROM members
        WHERE request_id = COALESCE(NEW.request_id, OLD.request_id);
        
        IF total_percentage != 100.00 THEN
          RAISE EXCEPTION 'La suma de porcentajes de participación debe ser 100%%. Actual: %%%', total_percentage;
        END IF;
        
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER check_member_percentages
      AFTER INSERT OR UPDATE OR DELETE ON members
      FOR EACH ROW
      EXECUTE FUNCTION validate_member_percentages()
    `);
  }
}

