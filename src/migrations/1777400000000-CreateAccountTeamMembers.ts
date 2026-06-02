import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountTeamMembers1777400000000 implements MigrationInterface {
  name = 'CreateAccountTeamMembers1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_team_members (
        id SERIAL PRIMARY KEY,
        owner_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        member_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        permissions JSONB NOT NULL DEFAULT '{}',
        invited_by_user_id INT NULL REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT uq_account_team_owner_member UNIQUE (owner_user_id, member_user_id),
        CONSTRAINT uq_account_team_member UNIQUE (member_user_id)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_team_owner ON account_team_members(owner_user_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_team_members;`);
  }
}
