import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTrustedLoginDevices1771300000000 implements MigrationInterface {
  name = 'CreateTrustedLoginDevices1771300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trusted_login_devices" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" integer NOT NULL,
        "secretHash" character varying(64) NOT NULL,
        "userAgentHash" character varying(64) NOT NULL,
        "ipHash" character varying(64),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "lastUsedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_trusted_login_devices" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_trusted_login_devices_userId" ON "trusted_login_devices" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_trusted_login_devices_userId"`);
    await queryRunner.query(`DROP TABLE "trusted_login_devices"`);
  }
}
