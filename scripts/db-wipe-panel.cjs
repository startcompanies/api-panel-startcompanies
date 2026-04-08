#!/usr/bin/env node
/**
 * Limpia datos del panel (SQL en scripts/sql/panel-wipe-keep-blog-staff.sql).
 * Ruta del SQL desde la raíz del repo (válido en dev y en deploy con carpeta scripts/).
 *
 * Uso local:
 *   npm run db:wipe-panel -- --yes
 *
 * Producción (requiere doble confirmación):
 *   NODE_ENV=production PANEL_WIPE_ALLOW_IN_PRODUCTION=1 npm run db:wipe-panel:prod -- --yes
 *
 * Variables: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * Opcional: DB_SSL=true (p. ej. RDS), DB_SSL_REJECT_UNAUTHORIZED=false
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function requireEnv(name) {
  const v = process.env[name];
  if (v == null || v === '') {
    throw new Error(`Falta variable de entorno ${name}`);
  }
  return v;
}

async function main() {
  if (!process.argv.includes('--yes')) {
    console.error('No se ejecuta sin confirmación explícita.');
    console.error('  Local:  npm run db:wipe-panel -- --yes');
    console.error(
      '  Prod:   NODE_ENV=production PANEL_WIPE_ALLOW_IN_PRODUCTION=1 npm run db:wipe-panel:prod -- --yes',
    );
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production' && process.env.PANEL_WIPE_ALLOW_IN_PRODUCTION !== '1') {
    console.error(
      'Refusing to run against production without PANEL_WIPE_ALLOW_IN_PRODUCTION=1 (además de --yes).',
    );
    process.exit(1);
  }

  const sqlPath = path.join(process.cwd(), 'scripts', 'sql', 'panel-wipe-keep-blog-staff.sql');
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`No se encuentra el SQL: ${sqlPath} (ejecuta desde la raíz del proyecto api-panel-startcompanies)`);
  }
  const sql = fs.readFileSync(sqlPath, 'utf8');

  /** @type {import('pg').ClientConfig} */
  const config = {
    host: requireEnv('DB_HOST'),
    port: parseInt(requireEnv('DB_PORT'), 10),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  };

  if (process.env.DB_SSL === 'true') {
    config.ssl = {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    };
  }

  const client = new Client(config);
  await client.connect();
  try {
    await client.query(sql);
    console.log('OK: panel limpiado; conservados blog y usuarios admin/user/editor (+ autores de posts).');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
