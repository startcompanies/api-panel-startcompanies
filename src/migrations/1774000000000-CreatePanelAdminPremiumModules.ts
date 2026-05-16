import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePanelAdminPremiumModules1774000000000 implements MigrationInterface {
  name = 'CreatePanelAdminPremiumModules1774000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        client_id INT NOT NULL,
        issued_by_user_id INT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'draft',
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        due_date DATE NULL,
        sent_at TIMESTAMPTZ NULL,
        pdf_url TEXT NULL,
        notes TEXT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL,
        description TEXT NOT NULL,
        qty NUMERIC(10,2) NOT NULL DEFAULT 1,
        unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
        line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invoice_payments (
        id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL,
        amount NUMERIC(12,2) NOT NULL DEFAULT 0,
        paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        method VARCHAR(60) NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS invoice_events (
        id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL,
        event_type VARCHAR(50) NOT NULL,
        payload JSONB NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalog_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalog_items (
        id SERIAL PRIMARY KEY,
        category_id INT NULL,
        name VARCHAR(160) NOT NULL,
        description TEXT NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS catalog_prices (
        id SERIAL PRIMARY KEY,
        item_id INT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        currency VARCHAR(3) NOT NULL DEFAULT 'USD',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bank_accounts (
        id SERIAL PRIMARY KEY,
        owner_user_id INT NOT NULL,
        bank_name VARCHAR(120) NOT NULL,
        account_mask VARCHAR(20) NULL,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bank_imports (
        id SERIAL PRIMARY KEY,
        bank_account_id INT NOT NULL,
        file_name VARCHAR(220) NOT NULL,
        rows_count INT NOT NULL DEFAULT 0,
        imported_by_user_id INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bank_transactions (
        id SERIAL PRIMARY KEY,
        bank_import_id INT NOT NULL,
        tx_date DATE NOT NULL,
        description TEXT NOT NULL,
        amount NUMERIC(12,2) NOT NULL,
        fingerprint VARCHAR(140) NOT NULL UNIQUE,
        category_id INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS accounting_categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        side VARCHAR(12) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS pl_snapshots (
        id SERIAL PRIMARY KEY,
        from_date DATE NOT NULL,
        to_date DATE NOT NULL,
        income_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        expense_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        net_total NUMERIC(12,2) NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS library_folders (
        id SERIAL PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        owner_user_id INT NOT NULL,
        parent_folder_id INT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS library_documents (
        id SERIAL PRIMARY KEY,
        folder_id INT NULL,
        owner_user_id INT NOT NULL,
        title VARCHAR(220) NOT NULL,
        file_url TEXT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS library_tags (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL,
        tag VARCHAR(80) NOT NULL
      );
      CREATE TABLE IF NOT EXISTS document_shares (
        id SERIAL PRIMARY KEY,
        document_id INT NOT NULL,
        shared_with_user_id INT NOT NULL,
        permission VARCHAR(20) NOT NULL DEFAULT 'read',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS premium_videos (
        id SERIAL PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        description TEXT NOT NULL,
        video_url TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS llc_guides (
        id SERIAL PRIMARY KEY,
        title VARCHAR(180) NOT NULL,
        content TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS content_access_logs (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        content_type VARCHAR(20) NOT NULL,
        content_id INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS content_access_logs;
      DROP TABLE IF EXISTS llc_guides;
      DROP TABLE IF EXISTS premium_videos;
      DROP TABLE IF EXISTS document_shares;
      DROP TABLE IF EXISTS library_tags;
      DROP TABLE IF EXISTS library_documents;
      DROP TABLE IF EXISTS library_folders;
      DROP TABLE IF EXISTS pl_snapshots;
      DROP TABLE IF EXISTS accounting_categories;
      DROP TABLE IF EXISTS bank_transactions;
      DROP TABLE IF EXISTS bank_imports;
      DROP TABLE IF EXISTS bank_accounts;
      DROP TABLE IF EXISTS catalog_prices;
      DROP TABLE IF EXISTS catalog_items;
      DROP TABLE IF EXISTS catalog_categories;
      DROP TABLE IF EXISTS invoice_events;
      DROP TABLE IF EXISTS invoice_payments;
      DROP TABLE IF EXISTS invoice_items;
      DROP TABLE IF EXISTS invoices;
    `);
  }
}

