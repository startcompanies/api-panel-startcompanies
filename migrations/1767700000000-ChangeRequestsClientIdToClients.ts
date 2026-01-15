import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class ChangeRequestsClientIdToClients1767700000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Paso 0: Eliminar la foreign key constraint antigua PRIMERO para evitar violaciones
    // Esto nos permite actualizar los registros sin restricciones
    try {
      await queryRunner.query(`
        ALTER TABLE requests 
        DROP CONSTRAINT IF EXISTS "FK_e336e481a84734861089a92a233"
      `);
    } catch (error) {
      // Si la constraint no existe o tiene otro nombre, intentar encontrarla
      const constraints = await queryRunner.query(`
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE table_name = 'requests'
        AND constraint_type = 'FOREIGN KEY'
        AND constraint_name LIKE '%client%'
      `);
      
      for (const constraint of constraints) {
        await queryRunner.query(`
          ALTER TABLE requests 
          DROP CONSTRAINT IF EXISTS "${constraint.constraint_name}"
        `);
      }
    }

    // Paso 1: Identificar y manejar requests con client_id que no existen en users
    // Estas son requests "huérfanas" que necesitan ser manejadas
    const orphanRequests = await queryRunner.query(`
      SELECT DISTINCT r.id, r.client_id
      FROM requests r
      WHERE r.client_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = r.client_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM clients c WHERE c.id = r.client_id
      )
    `);

    // Para requests huérfanas, establecer client_id como NULL
    if (orphanRequests.length > 0) {
      console.log(`⚠️ Encontradas ${orphanRequests.length} requests con client_id inexistente. Se establecerán como NULL.`);
      
      // Actualizar las requests huérfanas
      for (const orphan of orphanRequests) {
        await queryRunner.query(`
          UPDATE requests
          SET client_id = NULL
          WHERE id = $1
        `, [orphan.id]);
      }
    }

    // Paso 2: Crear registros en clients para cada User con type='client' que tenga requests
    // Primero, obtener todos los client_ids únicos de requests que apuntan a users válidos
    const clientUserIds = await queryRunner.query(`
      SELECT DISTINCT r.client_id 
      FROM requests r
      INNER JOIN users u ON r.client_id = u.id
      WHERE u.type = 'client'
      AND NOT EXISTS (
        SELECT 1 FROM clients c WHERE c.user_id = u.id
      )
    `);

    // Crear registros en clients para cada User que no tenga un Client asociado
    for (const row of clientUserIds) {
      const userId = row.client_id;
      
      // Obtener datos del User
      const user = await queryRunner.query(`
        SELECT id, email, first_name, last_name, phone, status, "createdAt", "updatedAt"
        FROM users
        WHERE id = $1 AND type = 'client'
      `, [userId]);

      if (user.length > 0) {
        const userData = user[0];
        const fullName = `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || userData.email;
        
        // Obtener el partner_id de las requests asociadas (si existe)
        const partnerInfo = await queryRunner.query(`
          SELECT DISTINCT partner_id 
          FROM requests 
          WHERE client_id = $1 AND partner_id IS NOT NULL
          LIMIT 1
        `, [userId]);

        const partnerId = partnerInfo.length > 0 ? partnerInfo[0].partner_id : null;

        // Crear el Client
        await queryRunner.query(`
          INSERT INTO clients (uuid, email, full_name, phone, user_id, partner_id, status, "createdAt", "updatedAt")
          VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          userData.email,
          fullName,
          userData.phone || null,
          userId,
          partnerId,
          userData.status !== false,
          userData.createdAt || new Date(),
          userData.updatedAt || new Date(),
        ]);
      }
    }

    // Paso 3: Actualizar requests.client_id para apuntar a clients.id
    // Para cada request, buscar el client_id correspondiente en clients
    // Solo actualizar las que aún apuntan a users.id y el user existe
    await queryRunner.query(`
      UPDATE requests r
      SET client_id = c.id
      FROM clients c
      WHERE c.user_id = r.client_id
      AND EXISTS (
        SELECT 1 FROM users u WHERE u.id = r.client_id AND u.type = 'client'
      )
      AND NOT EXISTS (
        SELECT 1 FROM clients c2 WHERE c2.id = r.client_id
      )
    `);

    // Paso 4: Para requests que ya apuntan a clients (si hay alguna)
    // No hacer nada, ya están correctas

    // Paso 5: Crear la nueva foreign key constraint apuntando a clients.id
    await queryRunner.createForeignKey(
      'requests',
      new TableForeignKey({
        columnNames: ['client_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'clients',
        onDelete: 'RESTRICT',
        name: 'FK_requests_client_id_clients',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Paso 1: Eliminar la nueva foreign key constraint
    await queryRunner.dropForeignKey('requests', 'FK_requests_client_id_clients');

    // Paso 2: Actualizar requests.client_id para apuntar de vuelta a users.id
    // Para cada request, obtener el user_id del client asociado
    await queryRunner.query(`
      UPDATE requests r
      SET client_id = c.user_id
      FROM clients c
      WHERE c.id = r.client_id
      AND c.user_id IS NOT NULL
    `);

    // Paso 3: Recrear la foreign key constraint antigua apuntando a users
    await queryRunner.createForeignKey(
      'requests',
      new TableForeignKey({
        columnNames: ['client_id'],
        referencedColumnNames: ['id'],
        referencedTableName: 'users',
        onDelete: 'RESTRICT',
        name: 'FK_e336e481a84734861089a92a233',
      }),
    );
  }
}

