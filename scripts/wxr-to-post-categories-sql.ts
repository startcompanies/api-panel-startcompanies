/**
 * Lee un export WordPress (WXR posts.xml) y genera SQL para:
 *  - public.categories (UPSERT por slug)
 *  - public.post_categories (enlaza posts.slug con wp:post_name)
 *
 * Uso:
 *   npx ts-node --project tsconfig.json scripts/wxr-to-post-categories-sql.ts [/ruta/posts.xml]
 *   (sin -o escribe por defecto en scripts/posts-portable/post_categories_from_wxr.sql)
 *   npx ts-node --project tsconfig.json scripts/wxr-to-post-categories-sql.ts /ruta/posts.xml -o otra.sql
 *
 * Opciones:
 *   --stdout               Imprime el SQL por stdout (no escribe fichero por defecto)
 *   --execute              Tras escribir el .sql, ejecuta las sentencias en la BD de .env (DB_*)
 *   --skip-uncategorized   No enlaza la categoría WordPress "uncategorized"
 *
 * Las categorías se crean con INSERT ... WHERE NOT EXISTS (no depende de ON CONFLICT en slug);
 * luego UPDATE por slug para alinear el nombre con el WXR.
 */
import * as fs from 'fs';
import * as path from 'path';

import { createPgClient } from './db-pg-env';

function sqlLiteral(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

/**
 * Categorías definidas a nivel canal en algunos WXR (`<wp:category>...</wp:category>`).
 */
function parseChannelCategories(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const parts = xml.split(/<wp:category>/i).slice(1);
  for (const raw of parts) {
    const end = raw.search(/<\/wp:category>/i);
    const block = end === -1 ? raw : raw.slice(0, end);
    const nicM = block.match(
      /<wp:category_nicename>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/wp:category_nicename>/i,
    );
    const nameM = block.match(
      /<wp:cat_name>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/wp:cat_name>/i,
    );
    const nic = (nicM?.[1] ?? '').trim();
    if (!nic) continue;
    const label = (nameM?.[1] ?? '').trim().replace(/\s+/g, ' ') || nic;
    if (!map.has(nic)) map.set(nic, label);
  }
  return map;
}

function parseItems(xml: string): string[][] {
  const chunks = xml.split(/<item>/i).slice(1);
  const postSlugsWithCategories: string[][] = [];

  for (const raw of chunks) {
    const end = raw.indexOf('</item>');
    const chunk = end === -1 ? raw : raw.slice(0, end);
    if (!/<wp:post_type>\s*<!\[CDATA\[\s*post\s*\]\]>\s*<\/wp:post_type>/i.test(chunk)) {
      continue;
    }
    const nameM = chunk.match(
      /<wp:post_name>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/wp:post_name>/i,
    );
    const postSlug = (nameM?.[1] ?? '').trim();
    if (!postSlug) continue;

    const catPairs: { nicename: string; label: string }[] = [];
    const catRe =
      /<category\s+domain="category"\s+nicename="([^"]+)">\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/category>/gi;
    let m: RegExpExecArray | null;
    while ((m = catRe.exec(chunk)) !== null) {
      const nicename = (m[1] ?? '').trim();
      const label = (m[2] ?? '').trim().replace(/\s+/g, ' ');
      if (nicename) catPairs.push({ nicename, label: label || nicename });
    }
    if (catPairs.length === 0) continue;

    const lines: string[] = [postSlug];
    for (const { nicename, label } of catPairs) {
      lines.push(`${nicename}\t${label}`);
    }
    postSlugsWithCategories.push(lines);
  }

  return postSlugsWithCategories;
}

/** Salida por defecto al ejecutar npm run wxr:post-categories-sql sin -o ni --stdout */
const DEFAULT_SQL_OUT = path.join(
  __dirname,
  'posts-portable',
  'post_categories_from_wxr.sql',
);

const LOCAL_POSTS_XML = path.join(__dirname, 'posts.xml');

/** Igual que posts-portable: agrupa hasta `;` final por sentencia. */
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

async function executeSqlFile(body: string): Promise<void> {
  const stmts = sqlStatementsFromDump(body);
  const client = createPgClient();
  await client.connect();
  try {
    for (const s of stmts) {
      await client.query(s);
    }
    console.log(`Ejecutadas ${stmts.length} sentencias en la base (DB_NAME de .env).`);
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let skipUncategorized = false;
  let useStdout = false;
  let doExecute = false;
  const filtered: string[] = [];
  for (const a of argv) {
    if (a === '--skip-uncategorized') skipUncategorized = true;
    else if (a === '--stdout') useStdout = true;
    else if (a === '--execute') doExecute = true;
    else filtered.push(a);
  }

  const outIdx = filtered.indexOf('-o');
  let outPath: string | null = null;
  if (outIdx !== -1 && filtered[outIdx + 1]) {
    outPath = path.resolve(process.cwd(), filtered[outIdx + 1]);
    filtered.splice(outIdx, 2);
  }

  const wxrPath = filtered[0]
    ? path.resolve(process.cwd(), filtered[0])
    : fs.existsSync(LOCAL_POSTS_XML)
      ? LOCAL_POSTS_XML
      : path.join(process.env.HOME ?? '', 'Downloads', 'posts.xml');

  if (!fs.existsSync(wxrPath)) {
    console.error(`No existe el archivo: ${wxrPath}`);
    console.error(
      'Uso: npx ts-node --project tsconfig.json scripts/wxr-to-post-categories-sql.ts [<posts.xml>] [-o salida.sql] [--stdout] [--execute] [--skip-uncategorized]',
    );
    console.error(
      `  Sin -o: escribe en ${DEFAULT_SQL_OUT}; --execute aplica el SQL en la BD de .env tras escribir.`,
    );
    process.exit(1);
  }

  const xml = fs.readFileSync(wxrPath, 'utf8');
  const rows = parseItems(xml);

  /** slug categoría -> nombre para INSERT */
  const categoryBySlug = new Map<string, string>();
  /** pares (postSlug, catSlug) únicos */
  const links = new Set<string>();

  for (const lines of rows) {
    const postSlug = lines[0];
    for (let i = 1; i < lines.length; i++) {
      const [nicename, label] = lines[i].split('\t');
      if (!nicename) continue;
      if (skipUncategorized && nicename === 'uncategorized') continue;
      if (!categoryBySlug.has(nicename)) {
        categoryBySlug.set(nicename, label || nicename);
      }
      links.add(`${postSlug}|||${nicename}`);
    }
  }

  /** Nombres canónicos del bloque `<wp:category>` del canal (si existen), pisan etiquetas inferidas de posts. */
  for (const [slug, label] of parseChannelCategories(xml)) {
    categoryBySlug.set(slug, label);
  }

  const out: string[] = [
    '-- Generado por scripts/wxr-to-post-categories-sql.ts desde WordPress WXR',
    '-- Crea categorías si no existen (slug); sincroniza nombre; enlaces post_categories por posts.slug',
    'BEGIN;',
    '',
  ];

  const catSlugs = [...categoryBySlug.keys()].sort();
  for (const slug of catSlugs) {
    const name = categoryBySlug.get(slug)!;
    out.push(
      `INSERT INTO categories (name, slug, description, "createdAt", "updatedAt") SELECT ${sqlLiteral(name)}, ${sqlLiteral(slug)}, NULL, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM categories c WHERE c.slug = ${sqlLiteral(slug)});`,
    );
    out.push(
      `UPDATE categories SET name = ${sqlLiteral(name)}, "updatedAt" = NOW() WHERE slug = ${sqlLiteral(slug)};`,
    );
  }

  out.push('');
  const linkList = [...links].sort();
  for (const key of linkList) {
    const [postSlug, catSlug] = key.split('|||');
    out.push(
      `INSERT INTO post_categories ("post_id", "category_id") SELECT p.id, c.id FROM posts p JOIN categories c ON c.slug = ${sqlLiteral(catSlug)} WHERE p.slug = ${sqlLiteral(postSlug)} ON CONFLICT ("post_id", "category_id") DO NOTHING;`,
    );
  }

  out.push('');
  out.push('COMMIT;');
  out.push('');

  const body = out.join('\n');
  if (useStdout) {
    process.stdout.write(body);
    if (doExecute) {
      console.error('No se puede usar --execute con --stdout.');
      process.exit(1);
    }
    return;
  }
  const targetPath = outPath ?? DEFAULT_SQL_OUT;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, body, 'utf8');
  console.log(
    `Escrito: ${targetPath} (${catSlugs.length} categorías, ${linkList.length} enlaces)`,
  );
  if (doExecute) {
    await executeSqlFile(body);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
