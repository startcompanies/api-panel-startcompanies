/**
 * Script para extraer el post-title (título visible en la página) de cada URL
 * de businessenusa.com. El título está en un elemento con clase
 * "elementor-heading-title elementor-size-default".
 *
 * Añade el campo post_title a cada entrada del JSON (distinto del title SEO).
 *
 * Uso: npx ts-node --project tsconfig.json -r tsconfig-paths/register scripts/fetch-post-titles-from-businessenusa.ts [ruta-json]
 */
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

const DEFAULT_JSON_PATH = path.join(__dirname, '../businessenusa-migration-meta.json');

// Solo H1 con class elementor-heading-title + elementor-size-default
const H1_RE = /<h1[^>]*class="([^"]*)"[^>]*>([\s\S]*?)<\/h1>/gi;

const REQUIRED_CLASSES = ['elementor-heading-title', 'elementor-size-default'];

function hasRequiredClasses(classAttr: string): boolean {
  return REQUIRED_CLASSES.every((c) => classAttr.includes(c));
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, (m) => {
      const code = parseInt(m.slice(2, -1), 10);
      return String.fromCharCode(code);
    })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
}

function extractPostTitle(html: string): string | null {
  let match: RegExpExecArray | null;
  H1_RE.lastIndex = 0;
  while ((match = H1_RE.exec(html)) !== null) {
    const [, classAttr, inner] = match;
    if (hasRequiredClasses(classAttr)) {
      return stripHtml(inner) || null;
    }
  }
  return null;
}

interface MigrationEntry {
  slug: string;
  url_original: string;
  url_nueva: string;
  title: string;
  description: string;
  post_title?: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const jsonPath = process.argv[2] || DEFAULT_JSON_PATH;
  const absolutePath = path.isAbsolute(jsonPath) ? jsonPath : path.resolve(process.cwd(), jsonPath);

  if (!fs.existsSync(absolutePath)) {
    console.error('No se encontró el archivo:', absolutePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(absolutePath, 'utf-8');
  const data: MigrationEntry[] = JSON.parse(raw);

  console.log(`Procesando ${data.length} URLs para extraer post_title...\n`);

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    try {
      const res = await axios.get<string>(entry.url_original, {
        responseType: 'text',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; migration-script/1.0)',
        },
      });
      const postTitle = extractPostTitle(res.data);
      (entry as MigrationEntry).post_title = postTitle ?? undefined;
      console.log(
        `[${i + 1}/${data.length}] ${entry.slug}: ${postTitle ?? '(no encontrado)'}`,
      );
    } catch (err: any) {
      console.warn(`[${i + 1}/${data.length}] ${entry.slug}: ERROR ${err.message || err}`);
      (entry as MigrationEntry).post_title = undefined;
    }
    await delay(800);
  }

  fs.writeFileSync(absolutePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('\nGuardado:', absolutePath);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
