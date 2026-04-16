/**
 * Exporta public.categories, public.posts y las tablas de unión post_categories / post_tags
 * a scripts/posts-portable/posts_data.sql, o importa ese archivo en otra base
 * PostgreSQL (UPSERT de categories/posts por id + enlaces M2M con ON CONFLICT DO NOTHING).
 *
 * El directorio scripts/posts-portable/ se crea al exportar si no existe.
 *
 * Uso (desarrollo, requiere ts-node):
 *   npm run posts:export
 *   npm run posts:import
 *
 * Export con columnas reducidas (p. ej. volcado ligero para staging):
 *   export [-o ruta.sql] [-x col1,col2] [--exclude=cols] [--partial] [--profile nombre]
 *   POSTS_EXPORT_EXCLUDE_COLUMNS=content,qa_todo
 *   POSTS_EXPORT_PARTIAL=1          → rellena NOT NULL sin default al omitir (p. ej. content → '')
 *   POSTS_EXPORT_PROFILE=staging    → exclusiones predefinidas (ver EXPORT_PROFILES)
 *
 * Perfiles npm (ejemplo; la BD sigue siendo la de .env al exportar):
 *   posts:export:staging → profile staging + partial + fichero posts_data.staging.sql (misma BD que .env)
 *   posts:export:prod    → volcado completo → posts_data.prod.sql
 *
 * El export incluye categories + posts + post_categories + post_tags según existan en esa BD
 * (staging vs prod lo defines tú apuntando .env a cada servidor antes de exportar).
 *
 * Qué campos ve el portal lo decide la API (`GET /blog/posts/public?audience=…`) y el front;
 * este script solo controla qué columnas van en el INSERT/UPDATE del SQL generado.
 *
 * Producción / imagen sin devDependencies:
 *   npm run build && npm run posts:import:prod
 *
 * Conexión: DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME en `.env`.
 * Import: POSTS_DATA_SQL o -i ruta.sql; session_replication_role = replica.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';

import { createPgClient, ROOT } from './db-pg-env';

const OUT_DIR = path.join(ROOT, 'scripts', 'posts-portable');

function defaultImportSqlPath(): string {
  const fromEnv = process.env.POSTS_DATA_SQL?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.join(ROOT, fromEnv);
  }
  return path.join(OUT_DIR, 'posts_data.sql');
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
  const meta = await fetchPostColumnMeta(client);
  return meta.map((m) => m.name);
}

interface PostColumnMeta {
  name: string;
  nullable: boolean;
  hasDefault: boolean;
  regtype: string;
}

async function fetchPostColumnMeta(client: Client): Promise<PostColumnMeta[]> {
  const res = await client.query<{
    name: string;
    nullable: boolean;
    has_default: boolean;
    regtype: string;
  }>(`
    SELECT
      a.attname::text AS name,
      NOT a.attnotnull AS nullable,
      a.atthasdef AS has_default,
      format_type(a.atttypid, a.atttypmod) AS regtype
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
  return res.rows.map((r) => ({
    name: r.name,
    nullable: r.nullable,
    hasDefault: r.has_default,
    regtype: r.regtype,
  }));
}

/** Perfiles de exclusión (nombres lógicos en minúsculas; se resuelven a columnas reales de PG). */
const EXPORT_PROFILES: Record<string, readonly string[]> = {
  /** Volcado ligero: sin HTML completo ni notas QA (útil para staging / revisión). */
  staging: ['content', 'qa_todo'],
  /** Solo quita el body HTML. */
  'staging-content': ['content'],
};

function sqlPlaceholderForPartial(meta: PostColumnMeta): string {
  const t = meta.regtype.toLowerCase();
  if (t === 'boolean') return 'FALSE';
  if (t.startsWith('timestamp')) return 'NOW()';
  if (
    t === 'text' ||
    t.startsWith('character varying') ||
    t.startsWith('varchar') ||
    t.startsWith('char(')
  ) {
    return "''";
  }
  if (t === 'jsonb') return "'{}'::jsonb";
  if (t === 'json') return "'[]'::json";
  console.error(
    `posts-portable: --partial no puede inventar valor seguro para columna "${meta.name}" (tipo ${meta.regtype}). Quita esa columna de la exclusión o exporta sin --partial.`,
  );
  process.exit(1);
}

function resolvePgColumnNames(
  wantedLower: Set<string>,
  allNames: string[],
): Set<string> {
  const lowerToReal = new Map<string, string>();
  for (const n of allNames) {
    lowerToReal.set(n.toLowerCase(), n);
  }
  const out = new Set<string>();
  for (const w of wantedLower) {
    const real = lowerToReal.get(w.toLowerCase());
    if (!real) {
      console.warn(`posts-portable: columna desconocida en exclusión/perfil: "${w}" (omitida).`);
      continue;
    }
    out.add(real);
  }
  return out;
}

function buildExportColumnPlan(
  allMeta: PostColumnMeta[],
  excludePg: Set<string>,
  partial: boolean,
): { insertCols: string[]; updateCols: string[]; placeholderCols: string[] } {
  const metaByName = new Map(allMeta.map((m) => [m.name, m]));
  const allNames = allMeta.map((m) => m.name);

  if (excludePg.has('id')) {
    console.error('posts-portable: no se puede excluir la columna "id".');
    process.exit(1);
  }

  const included = allNames.filter((n) => !excludePg.has(n));
  const placeholderCols: string[] = [];

  for (const name of excludePg) {
    const m = metaByName.get(name);
    if (!m) continue;
    if (m.nullable || m.hasDefault) continue;
    if (!partial) {
      console.error(
        `posts-portable: la columna "${name}" es NOT NULL sin DEFAULT; no puede omitirse sin --partial (o POSTS_EXPORT_PARTIAL=1).`,
      );
      process.exit(1);
    }
    placeholderCols.push(name);
  }

  placeholderCols.sort();
  const insertCols = [...included, ...placeholderCols];

  const updateCols = included.filter((c) => c !== 'id');
  return { insertCols, updateCols, placeholderCols };
}

interface ParsedExportCli {
  outPath?: string;
  excludeLower: Set<string>;
  partial: boolean;
  profile: string | null;
}

function parseExportArgv(argv: string[]): ParsedExportCli {
  const excludeLower = new Set<string>();
  let partial =
    process.env.POSTS_EXPORT_PARTIAL === '1' ||
    process.env.POSTS_EXPORT_PARTIAL === 'true';
  let profileFromArgv: string | null = null;
  let outPath: string | undefined;

  const envEx = process.env.POSTS_EXPORT_EXCLUDE_COLUMNS?.trim();
  if (envEx) {
    for (const p of envEx.split(',')) {
      const s = p.trim().toLowerCase();
      if (s) excludeLower.add(s);
    }
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' && argv[i + 1]) {
      outPath = argv[++i];
      continue;
    }
    if ((a === '-x' || a === '--exclude') && argv[i + 1]) {
      const v = argv[++i];
      for (const p of v.split(',')) {
        const s = p.trim().toLowerCase();
        if (s) excludeLower.add(s);
      }
      continue;
    }
    if (a === '--partial') {
      partial = true;
      continue;
    }
    if (a.startsWith('--exclude=')) {
      const v = a.slice('--exclude='.length);
      for (const p of v.split(',')) {
        const s = p.trim().toLowerCase();
        if (s) excludeLower.add(s);
      }
      continue;
    }
    if (a === '--profile' && argv[i + 1]) {
      profileFromArgv = argv[++i].trim() || null;
      continue;
    }
    if (a.startsWith('--profile=')) {
      profileFromArgv = a.slice('--profile='.length).trim() || null;
      continue;
    }
  }

  const effectiveProfile =
    (profileFromArgv && profileFromArgv.trim()) ||
    process.env.POSTS_EXPORT_PROFILE?.trim() ||
    null;

  if (effectiveProfile) {
    const preset = EXPORT_PROFILES[effectiveProfile];
    if (!preset) {
      console.error(
        `posts-portable: perfil desconocido "${effectiveProfile}". Válidos: ${Object.keys(EXPORT_PROFILES).join(', ')}`,
      );
      process.exit(1);
    }
    for (const c of preset) excludeLower.add(c.toLowerCase());
  }

  return { outPath, excludeLower, partial, profile: effectiveProfile };
}

async function tableExists(client: Client, table: string): Promise<boolean> {
  const r = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists`,
    [table],
  );
  return Boolean(r.rows[0]?.exists);
}

async function fetchTableColumnNames(client: Client, table: string): Promise<string[]> {
  const r = await client.query<{ name: string }>(
    `
    SELECT a.attname::text AS name
    FROM pg_attribute a
    JOIN pg_class c ON a.attrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE c.relname = $1
      AND n.nspname = 'public'
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `,
    [table],
  );
  return r.rows.map((x) => x.name);
}

/** Agrupa líneas hasta una que termine en `;` (sentencias SQL multilínea). Omite comentarios `--`. */
function sqlStatementsFromDump(raw: string): string[] {
  const stmts: string[] = [];
  let buf = '';
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('--')) continue;
    if (trimmed === '' && !buf) continue;
    buf += (buf ? '\n' : '') + line;
    if (trimmed.endsWith(';')) {
      const stmt = buf.trim().replace(/;\s*$/, '').trim();
      if (stmt) stmts.push(stmt);
      buf = '';
    }
  }
  const tail = buf.trim().replace(/;\s*$/, '').trim();
  if (tail) stmts.push(tail);
  return stmts;
}

async function cmdExport(sqlPath: string, cli: ParsedExportCli): Promise<void> {
  const client = createPgClient();
  await client.connect();
  try {
    const allMeta = await fetchPostColumnMeta(client);
    const allNames = allMeta.map((m) => m.name);
    if (!allNames.includes('id')) {
      console.error('La tabla posts debe tener columna "id".');
      process.exit(1);
    }
    const metaByName = new Map(allMeta.map((m) => [m.name, m]));
    const excludePg = resolvePgColumnNames(cli.excludeLower, allNames);
    const { insertCols, updateCols, placeholderCols } = buildExportColumnPlan(
      allMeta,
      excludePg,
      cli.partial,
    );
    const placeholderSet = new Set(placeholderCols);

    const selectColList = allNames.map(quoteIdent).join(', ');
    const selectSql = `SELECT ${selectColList} FROM posts ORDER BY id ASC`;
    const { rows } = await client.query<Record<string, unknown>>(selectSql);

    const insertColListIdent = insertCols.map(quoteIdent).join(', ');
    const setClause =
      updateCols.length > 0
        ? updateCols.map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`).join(', ')
        : `${quoteIdent('id')} = EXCLUDED.${quoteIdent('id')}`;

    const excludedList = [...excludePg].sort().join(',') || '(ninguna)';
    const profileNote = cli.profile ? `profile=${cli.profile}` : 'profile=none';
    const lines: string[] = [
      '-- Generado por scripts/posts-portable.ts (export)',
      `-- ${profileNote} partial=${cli.partial} excluded=${excludedList}`,
      insertCols.length < allNames.length || placeholderCols.length > 0
        ? `-- columnas INSERT: ${insertCols.map(quoteIdent).join(', ')}`
        : '-- columnas: volcado completo',
      '-- Tablas: public.categories (UPSERT por id), posts (UPSERT por id), post_categories, post_tags',
      'BEGIN;',
    ];

    if (await tableExists(client, 'categories')) {
      const catCols = await fetchTableColumnNames(client, 'categories');
      if (!catCols.includes('id')) {
        console.warn('Aviso: tabla categories sin columna id; se omite en el export.');
      } else {
        const catSelectList = catCols.map(quoteIdent).join(', ');
        const catRes = await client.query<Record<string, unknown>>(
          `SELECT ${catSelectList} FROM categories ORDER BY id ASC`,
        );
        const insertList = catCols.map(quoteIdent).join(', ');
        const updateCols = catCols.filter((c) => c !== 'id');
        const catSetClause =
          updateCols.length > 0
            ? updateCols
                .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                .join(', ')
            : `${quoteIdent('id')} = EXCLUDED.${quoteIdent('id')}`;
        for (const crow of catRes.rows) {
          const values = catCols.map((c) => formatSqlLiteral(crow[c]));
          lines.push(
            `INSERT INTO categories (${insertList}) VALUES (${values.join(', ')}) ON CONFLICT (${quoteIdent('id')}) DO UPDATE SET ${catSetClause};`,
          );
        }
        lines.push(
          "SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE((SELECT MAX(id) FROM categories), 1), true);",
        );
        console.log(`categories: ${catRes.rows.length} filas`);
      }
    } else {
      console.warn('Aviso: no existe la tabla categories; se omite en el export.');
    }

    for (const row of rows) {
      const values = insertCols.map((col) => {
        if (placeholderSet.has(col)) {
          const m = metaByName.get(col)!;
          return sqlPlaceholderForPartial(m);
        }
        return formatSqlLiteral(row[col]);
      });
      const valuesSql = values.join(', ');
      const stmt = `INSERT INTO posts (${insertColListIdent}) VALUES (${valuesSql}) ON CONFLICT (${quoteIdent('id')}) DO UPDATE SET ${setClause};`;
      lines.push(stmt);
    }

    if (await tableExists(client, 'post_categories')) {
      const pc = await client.query<{ post_id: number; category_id: number }>(
        'SELECT "post_id", "category_id" FROM post_categories ORDER BY "post_id", "category_id"',
      );
      for (const r of pc.rows) {
        lines.push(
          `INSERT INTO post_categories ("post_id", "category_id") VALUES (${formatSqlLiteral(r.post_id)}, ${formatSqlLiteral(r.category_id)}) ON CONFLICT ("post_id", "category_id") DO NOTHING;`,
        );
      }
      console.log(`post_categories: ${pc.rows.length} filas`);
    } else {
      console.warn('Aviso: no existe la tabla post_categories; se omite en el export.');
    }

    if (await tableExists(client, 'post_tags')) {
      const pt = await client.query<{ post_id: number; tag_id: number }>(
        'SELECT "post_id", "tag_id" FROM post_tags ORDER BY "post_id", "tag_id"',
      );
      for (const r of pt.rows) {
        lines.push(
          `INSERT INTO post_tags ("post_id", "tag_id") VALUES (${formatSqlLiteral(r.post_id)}, ${formatSqlLiteral(r.tag_id)}) ON CONFLICT ("post_id", "tag_id") DO NOTHING;`,
        );
      }
      console.log(`post_tags: ${pt.rows.length} filas`);
    } else {
      console.warn('Aviso: no existe la tabla post_tags; se omite en el export.');
    }

    lines.push(
      "SELECT setval(pg_get_serial_sequence('posts', 'id'), COALESCE((SELECT MAX(id) FROM posts), 1), true);",
    );
    lines.push('COMMIT;');

    fs.mkdirSync(path.dirname(sqlPath), { recursive: true });
    fs.writeFileSync(sqlPath, lines.join('\n') + '\n', 'utf8');
    console.log(
      `Escrito: ${sqlPath} (${rows.length} posts; INSERT ${insertCols.length}/${allNames.length} columnas).`,
    );
  } finally {
    await client.end();
  }
}

async function cmdImport(sqlPath: string): Promise<void> {
  if (!fs.existsSync(sqlPath)) {
    console.error(`No existe el archivo: ${sqlPath}`);
    console.error(
      'Indica el volcado con: npm run posts:import:prod -- -i /ruta/posts_data.sql\n' +
        'o variable de entorno POSTS_DATA_SQL (ruta absoluta o relativa a la raíz del proyecto).',
    );
    process.exit(1);
  }
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const statements = sqlStatementsFromDump(raw);

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
  if (cmd === 'export') {
    const parsed = parseExportArgv(process.argv.slice(3));
    let sqlPath = path.join(OUT_DIR, 'posts_data.sql');
    if (parsed.outPath) {
      sqlPath = path.resolve(process.cwd(), parsed.outPath);
    }
    await cmdExport(sqlPath, parsed);
  } else if (cmd === 'import') {
    const inIdx = process.argv.indexOf('-i');
    let sqlPath = defaultImportSqlPath();
    if (inIdx !== -1 && process.argv[inIdx + 1]) {
      sqlPath = path.resolve(process.cwd(), process.argv[inIdx + 1]);
    }
    await cmdImport(sqlPath);
  } else {
    console.error(
      'Uso: ts-node scripts/posts-portable.ts export [-o ruta.sql] [-x col1,col2] [--exclude=cols] [--partial] [--profile staging|staging-content]\n' +
        '     ts-node scripts/posts-portable.ts import [-i ruta.sql]\n' +
        'Variables: POSTS_EXPORT_EXCLUDE_COLUMNS, POSTS_EXPORT_PARTIAL, POSTS_EXPORT_PROFILE',
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
