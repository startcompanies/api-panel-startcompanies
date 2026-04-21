import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Añade 4 columnas BOOLEAN a renovacion_llc_requests para los checkboxes
 * de tipo de declaración del wizard de renovación.
 */
export class AddDeclaracionFieldsToRenovacion1772200000000
  implements MigrationInterface
{
  name = 'AddDeclaracionFieldsToRenovacion1772200000000';

  private readonly columns = [
    'declaracion_inicial',
    'cambio_direccion_ra',
    'agregar_cambiar_socio',
    'declaracion_cierre',
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('renovacion_llc_requests');
    for (const colName of this.columns) {
      if (table?.findColumnByName(colName)) continue;
      await queryRunner.addColumn(
        'renovacion_llc_requests',
        new TableColumn({
          name: colName,
          type: 'boolean',
          isNullable: true,
          default: null,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('renovacion_llc_requests');
    for (const colName of this.columns) {
      if (!table?.findColumnByName(colName)) continue;
      await queryRunner.dropColumn('renovacion_llc_requests', colName);
    }
  }
}
