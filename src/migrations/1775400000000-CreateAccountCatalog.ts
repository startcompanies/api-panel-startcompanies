import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccountCatalog1775400000000 implements MigrationInterface {
  name = 'CreateAccountCatalog1775400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_catalog (
        id SERIAL PRIMARY KEY,
        code VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(180) NOT NULL,
        type VARCHAR(16) NOT NULL,
        pl_section VARCHAR(80) NULL,
        pl_group VARCHAR(80) NULL,
        order_index INT NOT NULL DEFAULT 0,
        is_system BOOLEAN NOT NULL DEFAULT FALSE,
        is_locked BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      INSERT INTO account_catalog (code, name, type, pl_section, pl_group, order_index, is_system, is_locked, active)
      VALUES
        ('SALES', 'Ventas y desarrollo de negocio', 'income', 'Ingresos de explotación', 'Ingresos y Ventas', 10, TRUE, TRUE, TRUE),
        ('OTHER_INCOME', 'Otros ingresos operativos', 'income', 'Ingresos de explotación', 'Otros Ingresos', 20, TRUE, TRUE, TRUE),
        ('REFUNDS', 'Reembolsos y contracargos', 'expense', 'Ingresos de explotación', 'Descuentos y Devoluciones', 30, TRUE, TRUE, TRUE),
        ('COL_SERV', 'Costo de servicios prestados', 'expense', 'Costo de Servicios', 'Costo de Servicios', 40, TRUE, TRUE, TRUE),
        ('ADMIN', 'Administración y gastos generales', 'expense', 'Gastos de Explotación', 'Administración y Gastos Generales', 50, TRUE, TRUE, TRUE),
        ('ADMIN/SOFTWARES', 'Software administrativo y SaaS', 'expense', 'Gastos de Explotación', 'Administración y Gastos Generales', 60, TRUE, TRUE, TRUE),
        ('ADMIN/OTHER', 'Otros gastos administrativos', 'expense', 'Gastos de Explotación', 'Administración y Gastos Generales', 70, TRUE, TRUE, TRUE),
        ('MKT', 'Marketing y publicidad', 'expense', 'Gastos de Explotación', 'Marketing y Publicidad', 80, TRUE, TRUE, TRUE),
        ('PAYROLL', 'Nómina, honorarios y personal', 'expense', 'Gastos de Explotación', 'Nómina, Honorarios y Personal', 90, TRUE, TRUE, TRUE),
        ('RENT', 'Alquiler y arrendamiento', 'expense', 'Gastos de Explotación', 'Oficina e Instalaciones', 100, TRUE, TRUE, TRUE),
        ('OFFICE/EQUIPMENT', 'Hardware y equipamiento', 'expense', 'Gastos de Explotación', 'Oficina e Instalaciones', 110, TRUE, TRUE, TRUE),
        ('OFFICE/SUPPLIES', 'Suministros y materiales de oficina', 'expense', 'Gastos de Explotación', 'Oficina e Instalaciones', 120, TRUE, TRUE, TRUE),
        ('UTILITIES', 'Servicios públicos (agua, gas, luz)', 'expense', 'Gastos de Explotación', 'Servicios Públicos', 130, TRUE, TRUE, TRUE),
        ('UTILITIES/ELECTRICITY', 'Electricidad y energía', 'expense', 'Gastos de Explotación', 'Servicios Públicos', 140, TRUE, TRUE, TRUE),
        ('UTILITIES/INTERNET', 'Internet y telecomunicaciones', 'expense', 'Gastos de Explotación', 'Servicios Públicos', 150, TRUE, TRUE, TRUE),
        ('TRAVEL', 'Viajes y transporte', 'expense', 'Gastos de Explotación', 'Viajes y Transporte', 160, TRUE, TRUE, TRUE),
        ('TRAVEL/MEALS', 'Comidas de viaje y viáticos', 'expense', 'Gastos de Explotación', 'Viajes y Transporte', 170, TRUE, TRUE, TRUE),
        ('INSURANCE', 'Seguros', 'expense', 'Gastos de Explotación', 'Seguros', 180, TRUE, TRUE, TRUE),
        ('FINANCE/CARD_FEES', 'Comisiones de tarjetas y pasarelas', 'expense', 'Gastos de Explotación', 'Finanzas y Banca', 190, TRUE, TRUE, TRUE),
        ('FINANCE/INTEREST', 'Intereses y cargos financieros', 'expense', 'Gastos de Explotación', 'Finanzas y Banca', 200, TRUE, TRUE, TRUE),
        ('MEALS/ENT', 'Comidas y entretenimiento', 'expense', 'Gastos de Explotación', 'Otras categorías operativas', 210, TRUE, TRUE, TRUE),
        ('UNCAT', 'Sin categorizar', 'other', 'Gastos de Explotación', 'Otras categorías operativas', 220, TRUE, TRUE, TRUE),
        ('INVEST', 'Inversiones y rendimientos', 'income', 'Extraordinarios', 'Ingresos extraordinarios', 230, TRUE, TRUE, TRUE),
        ('INVEST/DIVIDENDS', 'Dividendos de inversiones', 'income', 'Extraordinarios', 'Ingresos extraordinarios', 240, TRUE, TRUE, TRUE),
        ('INVEST/INTEREST', 'Ingresos por intereses', 'income', 'Extraordinarios', 'Ingresos extraordinarios', 250, TRUE, TRUE, TRUE),
        ('FX/GAIN', 'Ganancias por tipo de cambio', 'income', 'Extraordinarios', 'Ingresos extraordinarios', 260, TRUE, TRUE, TRUE),
        ('FX/LOSS', 'Pérdidas por tipo de cambio', 'expense', 'Extraordinarios', 'Gastos extraordinarios', 270, TRUE, TRUE, TRUE),
        ('CAPITAL', 'Capital y distribuciones del propietario', 'expense', 'Extraordinarios', 'Gastos extraordinarios', 280, TRUE, TRUE, TRUE)
      ON CONFLICT (code) DO NOTHING;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_catalog;`);
  }
}

