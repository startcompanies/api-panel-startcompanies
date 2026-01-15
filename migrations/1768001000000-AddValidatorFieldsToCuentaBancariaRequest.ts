import { MigrationInterface, QueryRunner } from "typeorm";

export class AddValidatorFieldsToCuentaBancariaRequest1768001000000 implements MigrationInterface {
    name = 'AddValidatorFieldsToCuentaBancariaRequest1768001000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_first_name" varchar(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_last_name" varchar(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_date_of_birth" date
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_nationality" varchar(100)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_citizenship" varchar(100)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_passport_number" varchar(100)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_scanned_passport_url" text
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_work_email" varchar(255)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_use_email_for_relay_login" boolean DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_phone" varchar(50)
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_can_receive_sms" boolean DEFAULT false
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            ADD COLUMN "validator_is_us_resident" boolean
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_is_us_resident"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_can_receive_sms"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_phone"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_use_email_for_relay_login"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_work_email"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_scanned_passport_url"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_passport_number"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_citizenship"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_nationality"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_date_of_birth"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_last_name"
        `);
        await queryRunner.query(`
            ALTER TABLE "cuenta_bancaria_requests"
            DROP COLUMN "validator_first_name"
        `);
    }
}
