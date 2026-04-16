/**
 * Carga `.env` en la raíz del repo y expone un cliente `pg` con DB_*.
 * Compartido por scripts/posts-portable.ts, wxr-to-post-categories-sql.ts, etc.
 */
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Client, ClientConfig } from 'pg';

export function projectRoot(): string {
  const parentName = path.basename(path.dirname(__dirname));
  return parentName === 'dist'
    ? path.join(__dirname, '..', '..')
    : path.join(__dirname, '..');
}

export const ROOT = projectRoot();

dotenv.config({ path: path.join(ROOT, '.env') });

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === '') {
    console.error(
      `Falta ${name}. Define DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME en .env (raíz del proyecto).`,
    );
    process.exit(1);
  }
  return v;
}

export function createPgClient(): Client {
  const config: ClientConfig = {
    host: requireEnv('DB_HOST'),
    port: parseInt(requireEnv('DB_PORT'), 10),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  };
  if (Number.isNaN(config.port)) {
    console.error('DB_PORT debe ser un número.');
    process.exit(1);
  }
  if (process.env.DB_SSL === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }
  return new Client(config);
}
