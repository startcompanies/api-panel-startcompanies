import { MigrationInterface, QueryRunner } from 'typeorm';

const PARTNER_FEATURES_JSON = JSON.stringify({
  invoicing: true,
  accounting: true,
  accountingAi: true,
  aiConfig: true,
  videos: true,
  guides: true,
});

/**
 * Clientes de partner (clients.partner_id): acceso al panel sin trial comercial.
 */
export class GrantPartnerClientsPlatformAccess1777900000000 implements MigrationInterface {
  name = 'GrantPartnerClientsPlatformAccess1777900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users u
      SET
        billing_subscription_status = 'active',
        billing_access_state = 'subscription_active',
        billing_trial_start_at = NULL,
        billing_trial_end_at = NULL,
        platform_plan_code = COALESCE(u.platform_plan_code, 'partner-portal'),
        platform_access_ends_at = '2099-12-31 23:59:59+00',
        platform_features = '${PARTNER_FEATURES_JSON}'::jsonb,
        "updatedAt" = NOW()
      FROM clients c
      WHERE c.user_id = u.id
        AND c.partner_id IS NOT NULL
        AND u.type = 'client';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE users u
      SET
        billing_subscription_status = NULL,
        billing_access_state = NULL,
        platform_plan_code = NULL,
        platform_access_ends_at = NULL,
        platform_features = NULL,
        "updatedAt" = NOW()
      FROM clients c
      WHERE c.user_id = u.id
        AND c.partner_id IS NOT NULL
        AND u.type = 'client'
        AND u.platform_plan_code = 'partner-portal';
    `);
  }
}
