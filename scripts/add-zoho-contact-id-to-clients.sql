-- Preferir migración TypeORM: npm run migration:run
-- Ver: src/migrations/1743950400000-AddZohoContactIdToClients.ts
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS zoho_contact_id VARCHAR(100) NULL;
