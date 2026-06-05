import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaPartnerId1777800000000 implements MigrationInterface {
  name = 'AddMediaPartnerId1777800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE premium_videos
        ADD COLUMN IF NOT EXISTS partner_id INT NULL REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_premium_videos_partner_id ON premium_videos(partner_id);

      ALTER TABLE llc_guides
        ADD COLUMN IF NOT EXISTS partner_id INT NULL REFERENCES users(id) ON DELETE CASCADE;
      CREATE INDEX IF NOT EXISTS idx_llc_guides_partner_id ON llc_guides(partner_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_premium_videos_partner_id;
      ALTER TABLE premium_videos DROP COLUMN IF EXISTS partner_id;
      DROP INDEX IF EXISTS idx_llc_guides_partner_id;
      ALTER TABLE llc_guides DROP COLUMN IF EXISTS partner_id;
    `);
  }
}
