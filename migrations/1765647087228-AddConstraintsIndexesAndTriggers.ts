import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConstraintsIndexesAndTriggers1765647087228
  implements MigrationInterface
{
  name = 'AddConstraintsIndexesAndTriggers1765647087228';

  // Helper function para agregar constraint solo si no existe
  private async addConstraintIfNotExists(
    queryRunner: QueryRunner,
    tableName: string,
    constraintName: string,
    checkExpression: string,
  ): Promise<void> {
    const exists = await queryRunner.query(`
      SELECT 1 FROM pg_constraint 
      WHERE conname = '${constraintName}' AND conrelid = '${tableName}'::regclass
    `);
    
    if (exists.length === 0) {
      await queryRunner.query(`
        ALTER TABLE "${tableName}" 
        ADD CONSTRAINT "${constraintName}" 
        CHECK (${checkExpression})
      `);
    }
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ============================================
    // CREAR TABLA request_required_documents (si no existe)
    // ============================================
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "request_required_documents" (
        "id" SERIAL PRIMARY KEY,
        "request_type" VARCHAR(50) NOT NULL CHECK (request_type IN ('apertura-llc', 'renovacion-llc', 'cuenta-bancaria')),
        "llc_type" VARCHAR(20) CHECK (llc_type IN ('single', 'multi')),
        "document_name" VARCHAR(255) NOT NULL,
        "document_type" VARCHAR(50) NOT NULL CHECK (document_type IN ('certificate', 'document', 'form', 'other')),
        "required" BOOLEAN DEFAULT TRUE,
        "description" TEXT,
        "display_order" INTEGER NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ============================================
    // AGREGAR CONSTRAINTS CHECK A TABLAS EXISTENTES
    // ============================================

    // Requests: type y status
    await this.addConstraintIfNotExists(
      queryRunner,
      'requests',
      'check_requests_type',
      "type IN ('apertura-llc', 'renovacion-llc', 'cuenta-bancaria')",
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'requests',
      'check_requests_status',
      "status IN ('pendiente', 'en-proceso', 'completada', 'rechazada')",
    );

    // Apertura LLC
    await this.addConstraintIfNotExists(
      queryRunner,
      'apertura_llc_requests',
      'check_apertura_current_step',
      'current_step_number BETWEEN 1 AND 6',
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'apertura_llc_requests',
      'check_apertura_llc_type',
      "llc_type IN ('single', 'multi')",
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'apertura_llc_requests',
      'check_apertura_registered_agent_type',
      "registered_agent_type IN ('persona', 'empresa')",
    );

    // Renovación LLC
    await this.addConstraintIfNotExists(
      queryRunner,
      'renovacion_llc_requests',
      'check_renovacion_current_step',
      'current_step_number BETWEEN 1 AND 6',
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'renovacion_llc_requests',
      'check_renovacion_llc_type',
      "llc_type IN ('single', 'multi')",
    );

    // Cuenta Bancaria
    await this.addConstraintIfNotExists(
      queryRunner,
      'cuenta_bancaria_requests',
      'check_cuenta_current_step',
      'current_step_number BETWEEN 1 AND 7',
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'cuenta_bancaria_requests',
      'check_cuenta_llc_type',
      "llc_type IN ('single', 'multi')",
    );

    // Members
    await this.addConstraintIfNotExists(
      queryRunner,
      'members',
      'check_member_percentage',
      'percentage_of_participation >= 0 AND percentage_of_participation <= 100',
    );

    // Process Steps
    await this.addConstraintIfNotExists(
      queryRunner,
      'process_steps',
      'check_process_steps_status',
      "status IN ('completed', 'current', 'pending')",
    );

    // Documents
    await this.addConstraintIfNotExists(
      queryRunner,
      'documents',
      'check_documents_type',
      "type IN ('certificate', 'document', 'form', 'other')",
    );

    // Notifications
    await this.addConstraintIfNotExists(
      queryRunner,
      'notifications',
      'check_notifications_type',
      "type IN ('info', 'success', 'warning', 'error')",
    );

    // User Preferences
    await this.addConstraintIfNotExists(
      queryRunner,
      'user_preferences',
      'check_user_preferences_language',
      "language IN ('es', 'en')",
    );
    await this.addConstraintIfNotExists(
      queryRunner,
      'user_preferences',
      'check_user_preferences_theme',
      "theme IN ('light', 'dark', 'auto')",
    );

    // Users: type (actualizar constraint)
    const userTypeExists = await queryRunner.query(`
      SELECT 1 FROM pg_constraint WHERE conname = 'check_user_type'
    `);
    if (userTypeExists.length > 0) {
      await queryRunner.query(`
        ALTER TABLE "users" DROP CONSTRAINT "check_user_type"
      `);
    }
    await queryRunner.query(`
      ALTER TABLE "users" 
      ADD CONSTRAINT "check_user_type" 
      CHECK (type IN ('user', 'client', 'partner', 'admin'))
    `);

    // ============================================
    // CREAR ÍNDICES PARA OPTIMIZACIÓN
    // ============================================
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_requests_client_id" ON "requests"("client_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_requests_partner_id" ON "requests"("partner_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_requests_status" ON "requests"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_requests_type" ON "requests"("type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_process_steps_request_id" ON "process_steps"("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_documents_request_id" ON "documents"("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_documents_request_field" ON "documents"("request_id", "field_name")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_user_id" ON "notifications"("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_notifications_read" ON "notifications"("user_id", "read")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_request_required_documents_type" 
      ON "request_required_documents"("request_type", "llc_type")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_members_request_id" ON "members"("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bank_account_validators_request_id" 
      ON "bank_account_validators"("request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_bank_account_owners_request_id" 
      ON "bank_account_owners"("request_id")
    `);

    // ============================================
    // CREAR TRIGGER PARA VALIDAR PORCENTAJES DE MIEMBROS
    // ============================================
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION validate_member_percentages()
      RETURNS TRIGGER AS $$
      DECLARE
        total_percentage DECIMAL(5,2);
      BEGIN
        SELECT COALESCE(SUM(percentage_of_participation), 0)
        INTO total_percentage
        FROM members
        WHERE request_id = COALESCE(NEW.request_id, OLD.request_id);
        
        IF total_percentage != 100.00 THEN
          RAISE EXCEPTION 'La suma de porcentajes de participación debe ser 100%%. Actual: %%%', total_percentage;
        END IF;
        
        RETURN COALESCE(NEW, OLD);
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS check_member_percentages ON members
    `);
    await queryRunner.query(`
      CREATE TRIGGER check_member_percentages
      AFTER INSERT OR UPDATE OR DELETE ON members
      FOR EACH ROW
      EXECUTE FUNCTION validate_member_percentages()
    `);

    // ============================================
    // CREAR ÍNDICE ÚNICO PARA VALIDADOR DE CUENTA BANCARIA
    // ============================================
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_unique_bank_validator" 
      ON "members"("request_id") 
      WHERE validates_bank_account = true
    `);

    // ============================================
    // INSERTAR DATOS INICIALES DE DOCUMENTOS REQUERIDOS
    // ============================================
    // Verificar si ya existen datos para evitar duplicados
    const existingDocs = await queryRunner.query(`
      SELECT COUNT(*) as count FROM "request_required_documents"
    `);
    
    if (existingDocs[0].count === '0') {
      await queryRunner.query(`
        INSERT INTO "request_required_documents" 
        (request_type, llc_type, document_name, document_type, required, description, display_order) 
        VALUES
        -- Apertura LLC - Single Member
        ('apertura-llc', 'single', 'Identificación Oficial', 'document', true, 'Pasaporte o licencia del miembro', 1),
        ('apertura-llc', 'single', 'Comprobante de Domicilio', 'document', true, 'Comprobante de domicilio del miembro', 2),
        ('apertura-llc', 'single', 'Formulario SS-4 (EIN)', 'form', false, 'Solicitud de EIN - se puede obtener después', 3),
        ('apertura-llc', 'single', 'Operating Agreement', 'document', false, 'Acuerdo operativo - se genera si no se proporciona', 4),
        
        -- Apertura LLC - Multi Member
        ('apertura-llc', 'multi', 'Identificación Oficial de Todos los Miembros', 'document', true, 'Pasaporte o licencia de todos los miembros', 1),
        ('apertura-llc', 'multi', 'Comprobante de Domicilio de Todos los Miembros', 'document', true, 'Comprobante de domicilio de todos los miembros', 2),
        ('apertura-llc', 'multi', 'Operating Agreement', 'document', true, 'Acuerdo operativo de la LLC', 3),
        ('apertura-llc', 'multi', 'Acuerdo de Distribución de Porcentajes', 'document', true, 'Documento que define los porcentajes de cada miembro', 4),
        ('apertura-llc', 'multi', 'Formulario SS-4 (EIN)', 'form', false, 'Solicitud de EIN - se puede obtener después', 5),
        
        -- Renovación LLC - Single Member
        ('renovacion-llc', 'single', 'Certificado de LLC Existente', 'certificate', true, 'Certificado oficial de la LLC actual', 1),
        ('renovacion-llc', 'single', 'EIN Actual', 'document', true, 'EIN Confirmation Letter o documento con EIN', 2),
        ('renovacion-llc', 'single', 'Identificación Oficial Actualizada', 'document', true, 'Identificación oficial del miembro actualizada', 3),
        ('renovacion-llc', 'single', 'Comprobante de Domicilio Actualizado', 'document', true, 'Comprobante de domicilio actualizado del miembro', 4),
        ('renovacion-llc', 'single', 'Annual Report', 'document', true, 'Reporte anual si aplica al estado', 5),
        
        -- Renovación LLC - Multi Member
        ('renovacion-llc', 'multi', 'Certificado de LLC Existente', 'certificate', true, 'Certificado oficial de la LLC actual', 1),
        ('renovacion-llc', 'multi', 'EIN Actual', 'document', true, 'EIN Confirmation Letter o documento con EIN', 2),
        ('renovacion-llc', 'multi', 'Identificación Oficial de Todos los Miembros', 'document', true, 'Identificación oficial actualizada de todos los miembros', 3),
        ('renovacion-llc', 'multi', 'Comprobante de Domicilio Actualizado de Todos', 'document', true, 'Comprobante de domicilio actualizado de todos los miembros', 4),
        ('renovacion-llc', 'multi', 'Operating Agreement Actualizado', 'document', true, 'Operating Agreement actualizado si hay cambios', 5),
        ('renovacion-llc', 'multi', 'Annual Report', 'document', true, 'Reporte anual si aplica al estado', 6),
        
        -- Cuenta Bancaria
        ('cuenta-bancaria', NULL, 'EIN Confirmation Letter (CP 575)', 'certificate', true, 'Carta de confirmación del EIN emitida por el IRS', 1),
        ('cuenta-bancaria', NULL, 'Articles of Organization', 'certificate', true, 'Artículos de organización de la LLC', 2),
        ('cuenta-bancaria', NULL, 'Operating Agreement', 'document', true, 'Acuerdo operativo de la LLC', 3),
        ('cuenta-bancaria', NULL, 'Identificación Oficial del Miembro(s) Autorizado(s)', 'document', true, 'Identificación oficial de los miembros autorizados para la cuenta', 4),
        ('cuenta-bancaria', NULL, 'Comprobante de Domicilio del Negocio', 'document', true, 'Comprobante de domicilio comercial', 5),
        ('cuenta-bancaria', NULL, 'Comprobante de Domicilio Personal', 'document', true, 'Comprobante de domicilio personal del miembro(s)', 6),
        ('cuenta-bancaria', NULL, 'Formulario W-9', 'form', false, 'Formulario W-9 si aplica', 7)
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Eliminar trigger
    await queryRunner.query(`DROP TRIGGER IF EXISTS check_member_percentages ON members`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS validate_member_percentages()`);

    // Eliminar índices
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_unique_bank_validator"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bank_account_owners_request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_bank_account_validators_request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_members_request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_request_required_documents_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_read"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_notifications_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_documents_request_field"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_documents_request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_process_steps_request_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_requests_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_requests_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_requests_partner_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_requests_client_id"`);

    // Eliminar constraints
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "check_user_type"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP CONSTRAINT IF EXISTS "check_user_preferences_theme"`);
    await queryRunner.query(`ALTER TABLE "user_preferences" DROP CONSTRAINT IF EXISTS "check_user_preferences_language"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "check_notifications_type"`);
    await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "check_documents_type"`);
    await queryRunner.query(`ALTER TABLE "process_steps" DROP CONSTRAINT IF EXISTS "check_process_steps_status"`);
    await queryRunner.query(`ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "check_member_percentage"`);
    await queryRunner.query(`ALTER TABLE "cuenta_bancaria_requests" DROP CONSTRAINT IF EXISTS "check_cuenta_llc_type"`);
    await queryRunner.query(`ALTER TABLE "cuenta_bancaria_requests" DROP CONSTRAINT IF EXISTS "check_cuenta_current_step"`);
    await queryRunner.query(`ALTER TABLE "renovacion_llc_requests" DROP CONSTRAINT IF EXISTS "check_renovacion_llc_type"`);
    await queryRunner.query(`ALTER TABLE "renovacion_llc_requests" DROP CONSTRAINT IF EXISTS "check_renovacion_current_step"`);
    await queryRunner.query(`ALTER TABLE "apertura_llc_requests" DROP CONSTRAINT IF EXISTS "check_apertura_registered_agent_type"`);
    await queryRunner.query(`ALTER TABLE "apertura_llc_requests" DROP CONSTRAINT IF EXISTS "check_apertura_llc_type"`);
    await queryRunner.query(`ALTER TABLE "apertura_llc_requests" DROP CONSTRAINT IF EXISTS "check_apertura_current_step"`);
    await queryRunner.query(`ALTER TABLE "requests" DROP CONSTRAINT IF EXISTS "check_requests_status"`);
    await queryRunner.query(`ALTER TABLE "requests" DROP CONSTRAINT IF EXISTS "check_requests_type"`);

    // Eliminar tabla request_required_documents
    await queryRunner.query(`DROP TABLE IF EXISTS "request_required_documents"`);
  }
}
