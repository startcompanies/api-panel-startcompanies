import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAiCredentials1775200000000 implements MigrationInterface {
  name = 'CreateUserAiCredentials1775200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS user_ai_credentials (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        provider VARCHAR(20) NOT NULL,
        key_ciphertext TEXT NOT NULL,
        key_iv VARCHAR(64) NOT NULL,
        key_auth_tag VARCHAR(64) NOT NULL,
        key_last4 VARCHAR(4) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_user_ai_credentials_user_id ON user_ai_credentials(user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS user_ai_credentials;`);
  }
}
