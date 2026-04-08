import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLoginOtpChallenges1771200000000 implements MigrationInterface {
  name = 'CreateLoginOtpChallenges1771200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "login_otp_challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "userId" integer NOT NULL,
        "codeHash" character varying(64) NOT NULL,
        "rememberMe" boolean NOT NULL DEFAULT false,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "attemptCount" integer NOT NULL DEFAULT 0,
        "resendCount" integer NOT NULL DEFAULT 0,
        "consumedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_login_otp_challenges" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_login_otp_userId" ON "login_otp_challenges" ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_login_otp_userId"`);
    await queryRunner.query(`DROP TABLE "login_otp_challenges"`);
  }
}
