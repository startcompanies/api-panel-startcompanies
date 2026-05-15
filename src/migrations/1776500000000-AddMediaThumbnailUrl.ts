import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMediaThumbnailUrl1776500000000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE premium_videos
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    `);
    await queryRunner.query(`
      ALTER TABLE llc_guides
        ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE premium_videos DROP COLUMN IF EXISTS thumbnail_url;`);
    await queryRunner.query(`ALTER TABLE llc_guides DROP COLUMN IF EXISTS thumbnail_url;`);
  }
}
