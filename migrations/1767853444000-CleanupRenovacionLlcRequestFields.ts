import { MigrationInterface, QueryRunner } from "typeorm";

export class CleanupRenovacionLlcRequestFields1767853444000 implements MigrationInterface {
    name = 'CleanupRenovacionLlcRequestFields1767853444000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Renombrar total_revenue_2025 a total_revenue (sin año específico)
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            RENAME COLUMN "total_revenue_2025" TO "total_revenue"
        `);

        // Eliminar campos no usados en el formulario de renovación
        // (No eliminamos campos compartidos como paymentMethod, paymentProofUrl, etc.)
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            DROP COLUMN IF EXISTS "society_type",
            DROP COLUMN IF EXISTS "registration_number",
            DROP COLUMN IF EXISTS "has_data_or_directors_changes",
            DROP COLUMN IF EXISTS "physical_address",
            DROP COLUMN IF EXISTS "correspondence_address",
            DROP COLUMN IF EXISTS "country",
            DROP COLUMN IF EXISTS "city",
            DROP COLUMN IF EXISTS "postal_code",
            DROP COLUMN IF EXISTS "main_activity_description",
            DROP COLUMN IF EXISTS "contact_phone",
            DROP COLUMN IF EXISTS "contact_email",
            DROP COLUMN IF EXISTS "has_ein",
            DROP COLUMN IF EXISTS "responsible_person",
            DROP COLUMN IF EXISTS "wants_registered_agent",
            DROP COLUMN IF EXISTS "registered_agent_info",
            DROP COLUMN IF EXISTS "identity_document_url",
            DROP COLUMN IF EXISTS "proof_of_address_url",
            DROP COLUMN IF EXISTS "llc_contract_or_operating_agreement_url",
            DROP COLUMN IF EXISTS "articles_of_incorporation_url",
            DROP COLUMN IF EXISTS "registered_address",
            DROP COLUMN IF EXISTS "registered_country",
            DROP COLUMN IF EXISTS "registered_state",
            DROP COLUMN IF EXISTS "registered_city",
            DROP COLUMN IF EXISTS "registered_postal_code",
            DROP COLUMN IF EXISTS "capital_contributions_url",
            DROP COLUMN IF EXISTS "state_registration_url",
            DROP COLUMN IF EXISTS "certificate_of_good_standing_url"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Restaurar campos eliminados
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            ADD COLUMN "society_type" character varying(255),
            ADD COLUMN "registration_number" character varying(100),
            ADD COLUMN "has_data_or_directors_changes" boolean,
            ADD COLUMN "physical_address" character varying(500),
            ADD COLUMN "correspondence_address" character varying(500),
            ADD COLUMN "country" character varying(100),
            ADD COLUMN "city" character varying(100),
            ADD COLUMN "postal_code" character varying(20),
            ADD COLUMN "main_activity_description" text,
            ADD COLUMN "contact_phone" character varying(50),
            ADD COLUMN "contact_email" character varying(255),
            ADD COLUMN "has_ein" boolean,
            ADD COLUMN "responsible_person" jsonb,
            ADD COLUMN "wants_registered_agent" boolean,
            ADD COLUMN "registered_agent_info" jsonb,
            ADD COLUMN "identity_document_url" text,
            ADD COLUMN "proof_of_address_url" text,
            ADD COLUMN "llc_contract_or_operating_agreement_url" text,
            ADD COLUMN "articles_of_incorporation_url" text,
            ADD COLUMN "registered_address" character varying(500),
            ADD COLUMN "registered_country" character varying(100),
            ADD COLUMN "registered_state" character varying(100),
            ADD COLUMN "registered_city" character varying(100),
            ADD COLUMN "registered_postal_code" character varying(20),
            ADD COLUMN "capital_contributions_url" text,
            ADD COLUMN "state_registration_url" text,
            ADD COLUMN "certificate_of_good_standing_url" text
        `);

        // Renombrar total_revenue de vuelta a total_revenue_2025
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            RENAME COLUMN "total_revenue" TO "total_revenue_2025"
        `);
    }
}
