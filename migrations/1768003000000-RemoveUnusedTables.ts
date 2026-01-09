import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración para eliminar las tablas que ya no se usan:
 * - process_config: El frontend usa localStorage, no el backend
 * - user_preferences: El frontend usa localStorage, no el backend
 * - process_steps: No se usa desde el frontend, solo mencionado en documentación
 * - documents: Los documentos se suben a S3 y las URLs se guardan directamente en campos de request
 * - request_required_documents: No se usa actualmente
 *
 * IMPORTANTE: Antes de ejecutar esta migración, asegúrate de:
 * 1. Verificar que no hay datos importantes en estas tablas
 * 2. El frontend no depende de estos endpoints (ya confirmado)
 */
export class RemoveUnusedTables1768003000000 implements MigrationInterface {
  name = 'RemoveUnusedTables1768003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Eliminar las tablas en orden (respetando foreign keys si existen)
    await queryRunner.query(`
      DROP TABLE IF EXISTS "process_steps" CASCADE;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "user_preferences" CASCADE;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "process_config" CASCADE;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "documents" CASCADE;
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "request_required_documents" CASCADE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrear process_config (estructura básica)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "process_config" (
        "id" SERIAL NOT NULL,
        "auto_advance_steps" BOOLEAN DEFAULT false,
        "require_approval" BOOLEAN DEFAULT true,
        "default_assignee" VARCHAR(255),
        "notification_delay" INTEGER DEFAULT 24,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_process_config" PRIMARY KEY ("id")
      );
    `);

    // Recrear user_preferences (estructura básica)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "id" SERIAL NOT NULL,
        "user_id" INTEGER NOT NULL,
        "language" VARCHAR(10) DEFAULT 'es',
        "theme" VARCHAR(20) DEFAULT 'light',
        "timezone" VARCHAR(100) DEFAULT 'America/Mexico_City',
        "notifications" JSONB,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_user_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "FK_user_preferences_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_user_preferences_user" UNIQUE ("user_id")
      );
    `);

    // Recrear process_steps (estructura básica)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "process_steps" (
        "id" SERIAL NOT NULL,
        "request_id" INTEGER NOT NULL,
        "name" VARCHAR(255) NOT NULL,
        "description" TEXT,
        "order_number" INTEGER NOT NULL,
        "status" VARCHAR(50) DEFAULT 'pending',
        "assigned_to" INTEGER,
        "completed_by" INTEGER,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_process_steps" PRIMARY KEY ("id"),
        CONSTRAINT "FK_process_steps_request" FOREIGN KEY ("request_id")
          REFERENCES "requests"("id") ON DELETE CASCADE
      );
    `);
  }
}
