/**
 * Exporta la tabla public.posts a scripts/posts-portable/posts_data.sql
 * o importa ese archivo en otra base PostgreSQL (UPSERT por id).
 *
 * El directorio scripts/posts-portable/ se crea al exportar si no existe.
 *
 * Uso (desarrollo, requiere ts-node):
 *   npm run posts:export
 *   npm run posts:import
 * Producción / imagen sin devDependencies:
 *   npm run build && npm run posts:import:prod
 *   (equivalente: node dist/scripts/posts-portable.js import [-i ruta.sql])
 *
 * Conexión: mismas variables que la app — DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME
 * en `.env` en la raíz del proyecto. Opcional: DB_SSL=true, DB_SSL_REJECT_UNAUTHORIZED=false
 * (p. ej. RDS), igual que scripts/db-wipe-panel.cjs.
 *
 * Import: se usa `session_replication_role = replica` para no exigir que existan filas en
 * `users` referenciadas por `posts.user_id` (volcado en BD vacía o distinta).
 */
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { Client, ClientConfig } from 'pg';

/** Raíz del repo: dist/scripts → subir dos niveles; scripts/ → subir uno. */
function projectRoot(): string {
  const parentName = path.basename(path.dirname(__dirname));
  return parentName === 'dist'
    ? path.join(__dirname, '..', '..')
    : path.join(__dirname, '..');
}

const ROOT = projectRoot();
dotenv.config({ path: path.join(ROOT, '.env') });

const OUT_DIR = path.join(ROOT, 'scripts', 'posts-portable');
const DEFAULT_SQL = path.join(OUT_DIR, 'posts_data.sql');

function requireEnv(name: string): string {
  const v = process.env[name];
  if (v == null || v === '') {
    console.error(
      `Falta ${name}. Define DB_HOST, DB_PORT, DB_USER, DB_PASSWORD y DB_NAME en .env (raíz del proyecto).`,
    );
    process.exit(1);
  }
  return v;
}

function createPgClient(): Client {
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

/** Literal en una sola línea (E'' para textos con saltos o comillas). */
function formatSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (value instanceof Date) {
    const s = value.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    return formatSqlLiteral(s);
  }
  if (typeof value === 'string') {
    return (
      "E'" +
      value
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t') +
      "'"
    );
  }
  return formatSqlLiteral(String(value));
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

async function fetchPostColumns(client: Client): Promise<string[]> {
  const res = await client.query<{ attname: string }>(`
    SELECT a.attname
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = 'posts'
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `);
  if (res.rows.length === 0) {
    console.error('No se encontró la tabla "posts" en el esquema public.');
    process.exit(1);
  }
  return res.rows.map((r) => r.attname);
}

async function cmdExport(sqlPath: string): Promise<void> {
  const client = createPgClient();
  await client.connect();
  try {
    const cols = await fetchPostColumns(client);
    if (!cols.includes('id')) {
      console.error('La tabla posts debe tener columna "id".');
      process.exit(1);
    }
    const colList = cols.map(quoteIdent).join(', ');
    const selectSql = `SELECT ${colList} FROM posts ORDER BY id ASC`;
    const { rows } = await client.query<Record<string, unknown>>(selectSql);
    const updateCols = cols.filter((c) => c !== 'id');
    const setClause = updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ');

    const lines: string[] = [
      '-- Generado por npm run posts:export (scripts/posts-portable.ts)',
      '-- Tabla: public.posts (UPSERT por id)',
      'BEGIN;',
    ];

    for (const row of rows) {
      const values = cols.map((c) => formatSqlLiteral(row[c]));
      const valuesSql = values.join(', ');
      const stmt = `INSERT INTO posts (${colList}) VALUES (${valuesSql}) ON CONFLICT (${quoteIdent('id')}) DO UPDATE SET ${setClause};`;
      lines.push(stmt);
    }

    lines.push(
      "SELECT setval(pg_get_serial_sequence('posts', 'id'), COALESCE((SELECT MAX(id) FROM posts), 1), true);",
    );
    lines.push('COMMIT;');

    fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
    fs.writeFileSync(sqlPath, lines.join('\n') + '\n', 'utf8');
    console.log(`Escrito: ${sqlPath} (${rows.length} filas)`);
  } finally {
    await client.end();
  }
}

async function cmdImport(sqlPath: string): Promise<void> {
  if (!fs.existsSync(sqlPath)) {
    console.error(`No existe el archivo: ${sqlPath}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const statements = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'));

  const client = createPgClient();
  await client.connect();
  await client.query("SET session_replication_role = 'replica'");
  try {
    for (const stmt of statements) {
      await client.query(stmt);
    }
    console.log(`Importación completada (${statements.length} sentencias).`);
  } catch (e) {
    console.error('Error:', e);
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    try {
      await client.query("SET session_replication_role = 'origin'");
    } catch {
      /* conexión o transacción en estado inválido */
    }
    await client.end();
  }
}

async function main() {
  const cmd = process.argv[2];
  const outIdx = process.argv.indexOf('-o');
  const inIdx = process.argv.indexOf('-i');
  let sqlPath = DEFAULT_SQL;
  if (cmd === 'export' && outIdx !== -1 && process.argv[outIdx + 1]) {
    sqlPath = path.resolve(process.cwd(), process.argv[outIdx + 1]);
  }
  if (cmd === 'import' && inIdx !== -1 && process.argv[inIdx + 1]) {
    sqlPath = path.resolve(process.cwd(), process.argv[inIdx + 1]);
  }

  if (cmd === 'export') {
    await cmdExport(sqlPath);
  } else if (cmd === 'import') {
    await cmdImport(sqlPath);
  } else {
    console.error('Uso: ts-node scripts/posts-portable.ts <export|import> [-o|-i ruta.sql]');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
