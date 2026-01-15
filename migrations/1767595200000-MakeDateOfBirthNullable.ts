import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class MakeDateOfBirthNullable1767595200000 implements MigrationInterface {
  name = 'MakeDateOfBirthNullable1767595200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Hacer nullable date_of_birth en members
    await queryRunner.changeColumn(
      'members',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: true,
      }),
    );

    // Hacer nullable date_of_birth en bank_account_owners
    await queryRunner.changeColumn(
      'bank_account_owners',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: true,
      }),
    );

    // Hacer nullable date_of_birth en bank_account_validators
    await queryRunner.changeColumn(
      'bank_account_validators',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir: hacer NOT NULL date_of_birth en bank_account_validators
    await queryRunner.query(`
      UPDATE bank_account_validators 
      SET date_of_birth = CURRENT_DATE 
      WHERE date_of_birth IS NULL;
    `);
    await queryRunner.changeColumn(
      'bank_account_validators',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: false,
      }),
    );

    // Revertir: hacer NOT NULL date_of_birth en bank_account_owners
    await queryRunner.query(`
      UPDATE bank_account_owners 
      SET date_of_birth = CURRENT_DATE 
      WHERE date_of_birth IS NULL;
    `);
    await queryRunner.changeColumn(
      'bank_account_owners',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: false,
      }),
    );

    // Revertir: hacer NOT NULL date_of_birth en members
    await queryRunner.query(`
      UPDATE members 
      SET date_of_birth = CURRENT_DATE 
      WHERE date_of_birth IS NULL;
    `);
    await queryRunner.changeColumn(
      'members',
      'date_of_birth',
      new TableColumn({
        name: 'date_of_birth',
        type: 'date',
        isNullable: false,
      }),
    );
  }
}


