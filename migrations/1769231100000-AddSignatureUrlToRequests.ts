import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSignatureUrlToRequests1769231100000 implements MigrationInterface {
  name = 'AddSignatureUrlToRequests1769231100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requests" 
      ADD COLUMN "signature_url" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requests" 
      DROP COLUMN "signature_url"
    `);
  }
}
