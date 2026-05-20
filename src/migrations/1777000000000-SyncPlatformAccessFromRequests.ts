import { MigrationInterface, QueryRunner } from 'typeorm';

const BACKUP_TABLE = 'users_platform_sync_backup_1777000000000';

/**
 * Sincroniza platform_plan_code, platform_features y platform_access_ends_at
 * en usuarios client a partir de solicitudes existentes.
 *
 * Antes del UPDATE guarda snapshot en users_platform_sync_backup_1777000000000.
 * down() restaura desde esa tabla y la elimina.
 *
 * Reglas:
 * - Solo usuarios type = 'client' con client.user_id definido.
 * - Solo si platform_plan_code o platform_features están NULL.
 * - Solicitudes: apertura-llc | renovacion-llc | cuenta-bancaria con plan no vacío.
 * - Plan elegido: prioridad apertura-llc; luego createdAt DESC, id DESC.
 * - Plan debe existir en pricing_plans con platform_config.
 * - Primera asignación: trial de plataforma 60 días (platform_access_ends_at).
 * - billing_monthly_price_usd solo si platform_config.monthlyPriceAfterTrial no es null.
 */
export class SyncPlatformAccessFromRequests1777000000000 implements MigrationInterface {
  name = 'SyncPlatformAccessFromRequests1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
        user_id INT PRIMARY KEY,
        platform_plan_code VARCHAR(40),
        platform_features JSONB,
        platform_access_ends_at TIMESTAMPTZ,
        billing_monthly_price_usd NUMERIC(10, 2),
        "updatedAt" TIMESTAMPTZ,
        applied_plan_code VARCHAR(40) NOT NULL,
        backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      WITH eligible_requests AS (
        SELECT
          r.id AS request_id,
          r."client_id",
          r.type AS request_type,
          r.plan AS request_plan,
          r."createdAt" AS request_created_at
        FROM requests r
        WHERE r.type IN ('apertura-llc', 'renovacion-llc', 'cuenta-bancaria')
          AND r.plan IS NOT NULL
          AND BTRIM(r.plan) <> ''
      ),
      client_user AS (
        SELECT
          c.id AS client_id,
          c.user_id
        FROM clients c
        INNER JOIN users u ON u.id = c.user_id
        WHERE c.user_id IS NOT NULL
          AND u.type = 'client'
      ),
      ranked_request_plan AS (
        SELECT DISTINCT ON (cu.user_id)
          cu.user_id,
          er.request_plan,
          er.request_type,
          er.request_id
        FROM eligible_requests er
        INNER JOIN client_user cu ON cu.client_id = er."client_id"
        ORDER BY
          cu.user_id,
          CASE er.request_type WHEN 'apertura-llc' THEN 0 ELSE 1 END,
          er.request_created_at DESC,
          er.request_id DESC
      ),
      sync_source AS (
        SELECT
          rrp.user_id,
          pp.code AS plan_code,
          pp.platform_config -> 'features' AS features,
          (pp.platform_config ->> 'monthlyPriceAfterTrial')::numeric AS monthly_price_after_trial
        FROM ranked_request_plan rrp
        INNER JOIN pricing_plans pp
          ON pp.code = rrp.request_plan
         AND pp.platform_config IS NOT NULL
         AND pp.is_active = TRUE
      )
      INSERT INTO ${BACKUP_TABLE} (
        user_id,
        platform_plan_code,
        platform_features,
        platform_access_ends_at,
        billing_monthly_price_usd,
        "updatedAt",
        applied_plan_code
      )
      SELECT
        u.id,
        u.platform_plan_code,
        u.platform_features,
        u.platform_access_ends_at,
        u.billing_monthly_price_usd,
        u."updatedAt",
        src.plan_code
      FROM users u
      INNER JOIN sync_source src ON src.user_id = u.id
      WHERE u.platform_plan_code IS NULL OR u.platform_features IS NULL
      ON CONFLICT (user_id) DO NOTHING;
    `);

    await queryRunner.query(`
      WITH eligible_requests AS (
        SELECT
          r.id AS request_id,
          r."client_id",
          r.type AS request_type,
          r.plan AS request_plan,
          r."createdAt" AS request_created_at
        FROM requests r
        WHERE r.type IN ('apertura-llc', 'renovacion-llc', 'cuenta-bancaria')
          AND r.plan IS NOT NULL
          AND BTRIM(r.plan) <> ''
      ),
      client_user AS (
        SELECT
          c.id AS client_id,
          c.user_id
        FROM clients c
        INNER JOIN users u ON u.id = c.user_id
        WHERE c.user_id IS NOT NULL
          AND u.type = 'client'
      ),
      ranked_request_plan AS (
        SELECT DISTINCT ON (cu.user_id)
          cu.user_id,
          er.request_plan,
          er.request_type,
          er.request_id
        FROM eligible_requests er
        INNER JOIN client_user cu ON cu.client_id = er."client_id"
        ORDER BY
          cu.user_id,
          CASE er.request_type WHEN 'apertura-llc' THEN 0 ELSE 1 END,
          er.request_created_at DESC,
          er.request_id DESC
      ),
      sync_source AS (
        SELECT
          rrp.user_id,
          pp.code AS plan_code,
          pp.platform_config -> 'features' AS features,
          (pp.platform_config ->> 'monthlyPriceAfterTrial')::numeric AS monthly_price_after_trial
        FROM ranked_request_plan rrp
        INNER JOIN pricing_plans pp
          ON pp.code = rrp.request_plan
         AND pp.platform_config IS NOT NULL
         AND pp.is_active = TRUE
      )
      UPDATE users u
      SET
        platform_plan_code = src.plan_code,
        platform_features = src.features,
        platform_access_ends_at = NOW() + INTERVAL '60 days',
        billing_monthly_price_usd = CASE
          WHEN src.monthly_price_after_trial IS NOT NULL
          THEN src.monthly_price_after_trial
          ELSE u.billing_monthly_price_usd
        END,
        "updatedAt" = NOW()
      FROM sync_source src
      WHERE u.id = src.user_id
        AND (u.platform_plan_code IS NULL OR u.platform_features IS NULL);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.query(`
      SELECT to_regclass('public.${BACKUP_TABLE}') IS NOT NULL AS exists;
    `);
    if (!tableExists[0]?.exists) {
      return;
    }

    await queryRunner.query(`
      UPDATE users u
      SET
        platform_plan_code = b.platform_plan_code,
        platform_features = b.platform_features,
        platform_access_ends_at = b.platform_access_ends_at,
        billing_monthly_price_usd = b.billing_monthly_price_usd,
        "updatedAt" = b."updatedAt"
      FROM ${BACKUP_TABLE} b
      WHERE u.id = b.user_id;
    `);

    await queryRunner.query(`DROP TABLE IF EXISTS ${BACKUP_TABLE};`);
  }
}
