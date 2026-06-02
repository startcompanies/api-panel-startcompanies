import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaContentVisibility1777700000000 implements MigrationInterface {
  name = 'AddMediaContentVisibility1777700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE premium_videos
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'startcompanies';
      ALTER TABLE llc_guides
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'startcompanies';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE premium_videos DROP COLUMN IF EXISTS visibility;
      ALTER TABLE llc_guides DROP COLUMN IF EXISTS visibility;
    `);
  }
}
