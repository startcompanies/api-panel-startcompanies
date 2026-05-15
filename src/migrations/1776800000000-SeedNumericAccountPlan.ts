import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el plan de cuentas genérico con codificación numérica.
 * Solo inserta entradas que no existan por código (idempotente).
 */
export class SeedNumericAccountPlan1776800000000 implements MigrationInterface {
  private readonly accounts = [
    // ── INGRESOS (4xxx) ──────────────────────────────────────────
    { code: '4100', name: 'Ingresos por servicios', type: 'income', plSection: 'Ingresos de explotación', plGroup: 'Ingresos y Ventas', orderIndex: 1010 },
    { code: '4200', name: 'Ingresos por productos', type: 'income', plSection: 'Ingresos de explotación', plGroup: 'Ingresos y Ventas', orderIndex: 1020 },
    { code: '4300', name: 'Otros ingresos operativos', type: 'income', plSection: 'Ingresos de explotación', plGroup: 'Otros Ingresos', orderIndex: 1030 },
    { code: '4400', name: 'Descuentos y devoluciones sobre ventas', type: 'expense', plSection: 'Ingresos de explotación', plGroup: 'Descuentos y Devoluciones', orderIndex: 1040 },
    { code: '4900', name: 'Ingresos extraordinarios', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 1050 },

    // ── COSTO DE SERVICIOS (5xxx) ─────────────────────────────────
    { code: '5100', name: 'Costo de contratistas y subcontratistas', type: 'expense', plSection: 'Costo de Servicios', plGroup: 'Costo de Servicios', orderIndex: 2010 },
    { code: '5200', name: 'Costo de materiales y producción', type: 'expense', plSection: 'Costo de Servicios', plGroup: 'Costo de Servicios', orderIndex: 2020 },
    { code: '5300', name: 'Otros costos directos', type: 'expense', plSection: 'Costo de Servicios', plGroup: 'Costo de Servicios', orderIndex: 2030 },

    // ── GASTOS OPERATIVOS (6xxx) ──────────────────────────────────
    { code: '6100', name: 'Sueldos y salarios', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Nómina, Honorarios y Personal', orderIndex: 3010 },
    { code: '6110', name: 'Honorarios profesionales (contadores, abogados)', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Nómina, Honorarios y Personal', orderIndex: 3020 },
    { code: '6120', name: 'Comisiones de empleados', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Nómina, Honorarios y Personal', orderIndex: 3030 },
    { code: '6200', name: 'Alquiler de oficinas', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 3040 },
    { code: '6210', name: 'Software, SaaS y tecnología', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 3050 },
    { code: '6220', name: 'Telecomunicaciones e internet', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Servicios Públicos', orderIndex: 3060 },
    { code: '6230', name: 'Suministros de oficina', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 3070 },
    { code: '6240', name: 'Equipamiento y hardware', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Oficina e Instalaciones', orderIndex: 3080 },
    { code: '6300', name: 'Marketing y publicidad', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Marketing y Publicidad', orderIndex: 3090 },
    { code: '6310', name: 'Comisiones de referidos', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Marketing y Publicidad', orderIndex: 3100 },
    { code: '6400', name: 'Viajes y transporte', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Viajes y Transporte', orderIndex: 3110 },
    { code: '6410', name: 'Comidas y entretenimiento (50%)', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Viajes y Transporte', orderIndex: 3120 },
    { code: '6500', name: 'Seguros', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Seguros', orderIndex: 3130 },
    { code: '6600', name: 'Gastos legales y de registro', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 3140 },
    { code: '6700', name: 'Comisiones y pasarelas de pago', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Finanzas y Banca', orderIndex: 3150 },
    { code: '6710', name: 'Intereses y cargos bancarios', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Finanzas y Banca', orderIndex: 3160 },
    { code: '6800', name: 'Depreciación y amortización', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 3170 },
    { code: '6900', name: 'Impuestos y aranceles', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Administración y Gastos Generales', orderIndex: 3180 },
    { code: '6950', name: 'Otros gastos operativos', type: 'expense', plSection: 'Gastos de Explotación', plGroup: 'Otras categorías operativas', orderIndex: 3190 },

    // ── EXTRAORDINARIOS (7xxx) ────────────────────────────────────
    { code: '7100', name: 'Ganancia por venta de activos', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 4010 },
    { code: '7200', name: 'Pérdida por venta de activos', type: 'expense', plSection: 'Extraordinarios', plGroup: 'Gastos extraordinarios', orderIndex: 4020 },
    { code: '7300', name: 'Ingresos por intereses', type: 'income', plSection: 'Extraordinarios', plGroup: 'Ingresos extraordinarios', orderIndex: 4030 },
    { code: '7400', name: 'Distribuciones del propietario (Owner draws)', type: 'expense', plSection: 'Extraordinarios', plGroup: 'Gastos extraordinarios', orderIndex: 4040 },
    { code: '7900', name: 'Otros ingresos / gastos extraordinarios', type: 'other', plSection: 'Extraordinarios', plGroup: 'Otros extraordinarios', orderIndex: 4050 },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const acct of this.accounts) {
      await queryRunner.query(
        `INSERT INTO account_catalog (code, name, type, pl_section, pl_group, order_index, is_system, is_locked, active)
         VALUES ($1, $2, $3, $4, $5, $6, true, false, true)
         ON CONFLICT (code) DO NOTHING`,
        [acct.code, acct.name, acct.type, acct.plSection, acct.plGroup, acct.orderIndex],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const codes = this.accounts.map((a) => a.code);
    if (codes.length) {
      await queryRunner.query(
        `DELETE FROM account_catalog WHERE code = ANY($1) AND is_locked = false`,
        [codes],
      );
    }
  }
}
