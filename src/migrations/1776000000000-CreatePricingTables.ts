import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Crea las tablas del módulo de Precios (Apertura LLC, Renovaciones, Overrides y Misc)
 * y siembra los valores actuales del WizardPlansService del frontend.
 *
 * Valores semilla (alineados con src/app/features/wizard/services/wizard-plans.service.ts):
 *  - Pack Emprendedor (NM) $599
 *  - Pack Elite (any) $850
 *  - Pack Premium (NM/WY) $1450
 *  - Override apertura-llc + Elite + Texas → $750
 *  - Renovaciones por estado (single / multi):
 *      New Mexico 500/600, Florida 600/700, Wyoming 600/700,
 *      Delaware 950/950, Texas 750/750, Nevada 600/650
 *  - bank-account-fixed → $99
 */
export class CreatePricingTables1776000000000 implements MigrationInterface {
  name = 'CreatePricingTables1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_plans (
        id SERIAL PRIMARY KEY,
        code VARCHAR(40) NOT NULL UNIQUE,
        label VARCHAR(120) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        recommended BOOLEAN NOT NULL DEFAULT FALSE,
        description TEXT NULL,
        subtitle TEXT NULL,
        order_index INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_plan_states (
        id SERIAL PRIMARY KEY,
        plan_id INT NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
        state VARCHAR(60) NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        CONSTRAINT uq_pricing_plan_states UNIQUE (plan_id, state)
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_plan_states_plan_id ON pricing_plan_states(plan_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_plan_features (
        id SERIAL PRIMARY KEY,
        plan_id INT NOT NULL REFERENCES pricing_plans(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'feature',
        order_index INT NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_plan_features_plan_id ON pricing_plan_features(plan_id);
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_renewals (
        id SERIAL PRIMARY KEY,
        state VARCHAR(60) NOT NULL UNIQUE,
        single_price NUMERIC(10,2) NOT NULL,
        multi_price NUMERIC(10,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_overrides (
        id SERIAL PRIMARY KEY,
        service_type VARCHAR(40) NOT NULL,
        plan_code VARCHAR(40) NULL,
        state VARCHAR(60) NULL,
        price NUMERIC(10,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_overrides
        ON pricing_overrides(service_type, COALESCE(plan_code, ''), COALESCE(state, ''));
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS pricing_misc (
        id SERIAL PRIMARY KEY,
        code VARCHAR(60) NOT NULL UNIQUE,
        label VARCHAR(120) NOT NULL,
        price NUMERIC(10,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    /* ----------------------------- SEED ----------------------------- */

    /** Pack Emprendedor (NM) */
    const entrepreneurFeatures = [
      'Documentación completa: Artículos de organización, Operating Agreement, EIN.',
      'Consulta gratuita de planificación fiscal.',
      'Apertura de cuenta bancaria en EE.UU. garantizada en 7 días.',
      'Dirección fiscal y social en para apertura bancaria.',
      'Registered Agent - R.A.',
      'Asistencia con la implementación de sistemas de ventas como Stripe.',
      'Asesoría general sobre obligaciones legales de la LLC.',
      'E-book con información sobre LLCs.',
    ];

    /** Pack Elite (cualquier estado) */
    const eliteFeatures = [...entrepreneurFeatures];

    /** Pack Premium (NM / WY) */
    const premiumFeatures = [...entrepreneurFeatures];
    const premiumRenewal = [
      'Pago de fee al Estado (cumplimiento federal)',
      'Renovación de Registered Agent',
      'Presentación de Form 1120+5472 o 1065',
    ];

    const entrepreneurId = (
      await queryRunner.query(
        `INSERT INTO pricing_plans (code, label, price, recommended, description, subtitle, order_index)
         VALUES ('Entrepreneur', 'Pack Emprendedor', 599.00, TRUE,
                 'Ideal para freelancers y startups sin presencia en EE.UU.',
                 'LLC en Nuevo México (Single o Multi Member)', 1)
         RETURNING id;`,
      )
    )[0].id as number;

    const eliteId = (
      await queryRunner.query(
        `INSERT INTO pricing_plans (code, label, price, recommended, description, subtitle, order_index)
         VALUES ('Elite', 'Pack Elite', 850.00, FALSE,
                 'Ideal para quienes tienen presencia física en EE.UU.',
                 'LLC en cualquier estado (Single Member o Partnership)', 2)
         RETURNING id;`,
      )
    )[0].id as number;

    const premiumId = (
      await queryRunner.query(
        `INSERT INTO pricing_plans (code, label, price, recommended, description, subtitle, order_index)
         VALUES ('Premium', 'Pack Premium', 1450.00, FALSE,
                 'Solución integral con soporte fiscal y renovación automática.',
                 'Solo NM o Wyoming (Single Member)', 3)
         RETURNING id;`,
      )
    )[0].id as number;

    /** Estados habilitados por plan (`*` = comodín). */
    await queryRunner.query(
      `INSERT INTO pricing_plan_states (plan_id, state, order_index) VALUES
       ($1, 'New Mexico', 1),
       ($2, '*', 1),
       ($3, 'New Mexico', 1), ($3, 'Wyoming', 2);`,
      [entrepreneurId, eliteId, premiumId],
    );

    /** Features (kind = 'feature'). */
    for (let i = 0; i < entrepreneurFeatures.length; i++) {
      await queryRunner.query(
        `INSERT INTO pricing_plan_features (plan_id, text, kind, order_index) VALUES ($1, $2, 'feature', $3);`,
        [entrepreneurId, entrepreneurFeatures[i], i + 1],
      );
    }
    for (let i = 0; i < eliteFeatures.length; i++) {
      await queryRunner.query(
        `INSERT INTO pricing_plan_features (plan_id, text, kind, order_index) VALUES ($1, $2, 'feature', $3);`,
        [eliteId, eliteFeatures[i], i + 1],
      );
    }
    for (let i = 0; i < premiumFeatures.length; i++) {
      await queryRunner.query(
        `INSERT INTO pricing_plan_features (plan_id, text, kind, order_index) VALUES ($1, $2, 'feature', $3);`,
        [premiumId, premiumFeatures[i], i + 1],
      );
    }
    for (let i = 0; i < premiumRenewal.length; i++) {
      await queryRunner.query(
        `INSERT INTO pricing_plan_features (plan_id, text, kind, order_index) VALUES ($1, $2, 'renewal', $3);`,
        [premiumId, premiumRenewal[i], i + 1],
      );
    }

    /** Renovaciones por estado. */
    await queryRunner.query(`
      INSERT INTO pricing_renewals (state, single_price, multi_price) VALUES
        ('New Mexico', 500.00, 600.00),
        ('Florida',    600.00, 700.00),
        ('Wyoming',    600.00, 700.00),
        ('Delaware',   950.00, 950.00),
        ('Texas',      750.00, 750.00),
        ('Nevada',     600.00, 650.00);
    `);

    /** Override: apertura-llc + Elite + Texas → 750. */
    await queryRunner.query(`
      INSERT INTO pricing_overrides (service_type, plan_code, state, price)
      VALUES ('apertura-llc', 'Elite', 'Texas', 750.00);
    `);

    /** Misc: cuenta bancaria fija. */
    await queryRunner.query(`
      INSERT INTO pricing_misc (code, label, price)
      VALUES ('bank-account-fixed', 'Cuenta Bancaria — precio fijo', 99.00);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_misc;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_overrides;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_renewals;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_plan_features;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_plan_states;`);
    await queryRunner.query(`DROP TABLE IF EXISTS pricing_plans;`);
  }
}
