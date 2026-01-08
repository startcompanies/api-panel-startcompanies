import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAccountingFieldsToRenovacionLlcRequest1767853000000 implements MigrationInterface {
    name = 'AddAccountingFieldsToRenovacionLlcRequest1767853000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Agregar campos de información contable
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            ADD COLUMN "llc_opening_cost" numeric(12,2),
            ADD COLUMN "paid_to_family_members" numeric(12,2),
            ADD COLUMN "paid_to_local_companies" numeric(12,2),
            ADD COLUMN "paid_for_llc_formation" numeric(12,2),
            ADD COLUMN "paid_for_llc_dissolution" numeric(12,2),
            ADD COLUMN "bank_account_balance_end_of_year" numeric(12,2),
            ADD COLUMN "total_revenue_2025" numeric(12,2),
            ADD COLUMN "has_financial_investments_in_usa" character varying(50),
            ADD COLUMN "has_filed_taxes_before" character varying(50),
            ADD COLUMN "was_constituted_with_start_companies" character varying(50)
        `);

        // Agregar URLs de documentos adicionales
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            ADD COLUMN "partners_passports_file_url" text,
            ADD COLUMN "operating_agreement_additional_file_url" text,
            ADD COLUMN "form_147_or_575_file_url" text,
            ADD COLUMN "articles_of_organization_additional_file_url" text,
            ADD COLUMN "boi_report_file_url" text,
            ADD COLUMN "bank_statements_file_url" text
        `);

        // Agregar campos de declaraciones
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            ADD COLUMN "declaracion_inicial" boolean,
            ADD COLUMN "declaracion_ano_corriente" boolean,
            ADD COLUMN "cambio_direccion_ra" boolean,
            ADD COLUMN "cambio_nombre" boolean,
            ADD COLUMN "declaracion_anos_anteriores" boolean,
            ADD COLUMN "agregar_cambiar_socio" boolean,
            ADD COLUMN "declaracion_cierre" boolean
        `);

        // Agregar campos adicionales
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            ADD COLUMN "countries_where_llc_does_business" jsonb,
            ADD COLUMN "llc_creation_date" date,
            ADD COLUMN "has_property_in_usa" character varying(50),
            ADD COLUMN "almacena_productos_deposito_usa" character varying(50),
            ADD COLUMN "contrata_servicios_usa" character varying(50),
            ADD COLUMN "tiene_cuentas_bancarias" character varying(50)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar campos adicionales
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            DROP COLUMN "tiene_cuentas_bancarias",
            DROP COLUMN "contrata_servicios_usa",
            DROP COLUMN "almacena_productos_deposito_usa",
            DROP COLUMN "has_property_in_usa",
            DROP COLUMN "llc_creation_date",
            DROP COLUMN "countries_where_llc_does_business"
        `);

        // Eliminar campos de declaraciones
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            DROP COLUMN "declaracion_cierre",
            DROP COLUMN "agregar_cambiar_socio",
            DROP COLUMN "declaracion_anos_anteriores",
            DROP COLUMN "cambio_nombre",
            DROP COLUMN "cambio_direccion_ra",
            DROP COLUMN "declaracion_ano_corriente",
            DROP COLUMN "declaracion_inicial"
        `);

        // Eliminar URLs de documentos adicionales
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            DROP COLUMN "bank_statements_file_url",
            DROP COLUMN "boi_report_file_url",
            DROP COLUMN "articles_of_organization_additional_file_url",
            DROP COLUMN "form_147_or_575_file_url",
            DROP COLUMN "operating_agreement_additional_file_url",
            DROP COLUMN "partners_passports_file_url"
        `);

        // Eliminar campos de información contable
        await queryRunner.query(`
            ALTER TABLE "renovacion_llc_requests" 
            DROP COLUMN "was_constituted_with_start_companies",
            DROP COLUMN "has_filed_taxes_before",
            DROP COLUMN "has_financial_investments_in_usa",
            DROP COLUMN "total_revenue_2025",
            DROP COLUMN "bank_account_balance_end_of_year",
            DROP COLUMN "paid_for_llc_dissolution",
            DROP COLUMN "paid_for_llc_formation",
            DROP COLUMN "paid_to_local_companies",
            DROP COLUMN "paid_to_family_members",
            DROP COLUMN "llc_opening_cost"
        `);
    }
}
