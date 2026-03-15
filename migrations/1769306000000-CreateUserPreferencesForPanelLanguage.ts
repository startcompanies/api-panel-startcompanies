import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea la tabla user_preferences para persistir idioma y preferencias del panel por usuario.
 * Si la tabla fue eliminada por RemoveUnusedTables, la recreamos para soportar GET/PATCH de preferencias.
 */
export class CreateUserPreferencesForPanelLanguage1769306000000
  implements MigrationInterface
{
  name = 'CreateUserPreferencesForPanelLanguage1769306000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "id" SERIAL NOT NULL,
        "user_id" INTEGER NOT NULL,
        "language" VARCHAR(10) NOT NULL DEFAULT 'es',
        "theme" VARCHAR(20) NOT NULL DEFAULT 'light',
        "timezone" VARCHAR(100) NOT NULL DEFAULT 'America/Mexico_City',
        "notifications" JSONB NOT NULL DEFAULT '{"email": true, "push": true, "requestUpdates": true, "documentUploads": true}',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_preferences_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_preferences_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences" CASCADE;`);
  }
}
