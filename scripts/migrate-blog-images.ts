/**
 * Script para migrar imágenes de los posts del blog:
 * - Recorre todos los posts
 * - image_url: externa, o en media bajo blog/ pero fuera de blog/{slug}/ (p. ej. raíz blog/archivo.png)
 * - content: <img src>, srcset / data-srcset (responsive), URLs externas o media mal ubicadas
 *
 * Las imágenes quedan bajo blog/{slug}/ vía S3 (copia interna si ya están en el bucket en otra ruta).
 *
 * Uso: npm run migrate:blog-images
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { Post } from '../src/blog/posts/entities/post.entity';
import { UploadFileService } from '../src/shared/upload-file/upload-file.service';

const IMG_SRC = /<img[^>]+src\s*=\s*["']([^"']+)["']/gi;
const SOURCE_SRC = /<source[^>]+src\s*=\s*["']([^"']+)["']/gi;
const SRCSET_ATTR = /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/gi;

/** Comparación estable (sin query) para saber si hubo cambio tras uploadFromUrl. */
function urlIdentity(u: string): string {
  try {
    const x = new URL(u.trim());
    return `${x.hostname.toLowerCase()}|${x.pathname}`;
  } catch {
    return u.trim().split('?')[0].toLowerCase();
  }
}

function parseSrcsetUrls(srcsetValue: string): string[] {
  const out: string[] = [];
  for (const part of srcsetValue.split(',')) {
    const t = part.trim();
    if (!t) continue;
    const urlPart = t.split(/\s+/)[0]?.trim();
    if (urlPart && /^https?:\/\//i.test(urlPart)) {
      out.push(urlPart);
    }
  }
  return out;
}

/** Todas las URLs http(s) candidatas en img + srcset, únicas, más largas primero (evita reemplazos parciales). */
function extractAllBlogImageUrls(html: string): string[] {
  const raw: string[] = [];
  let m: RegExpExecArray | null;
  IMG_SRC.lastIndex = 0;
  while ((m = IMG_SRC.exec(html)) !== null) {
    raw.push(m[1].trim());
  }
  SOURCE_SRC.lastIndex = 0;
  while ((m = SOURCE_SRC.exec(html)) !== null) {
    raw.push(m[1].trim());
  }
  SRCSET_ATTR.lastIndex = 0;
  while ((m = SRCSET_ATTR.exec(html)) !== null) {
    raw.push(...parseSrcsetUrls(m[1]));
  }
  const uniq = [...new Set(raw.filter(Boolean))];
  uniq.sort((a, b) => b.length - a.length);
  return uniq;
}

/**
 * ¿Debe intentarse migrar esta URL para el post con carpeta `folder` (ej. blog/mi-slug)?
 * - Excluye: ya bajo mediaDomain/folder/
 * - Incluye: dominios externos con http(s)
 * - Incluye: mismo dominio de media y path bajo blog/ pero no bajo folder/ (plano u otro slug)
 */
function shouldConsiderForBlogMigration(
  url: string,
  mediaDomainClean: string,
  folder: string,
): boolean {
  const u = url.trim();
  if (!/^https?:\/\//i.test(u)) {
    return false;
  }
  const base = u.split('#')[0].split('?')[0];
  const expectedPrefix = `${mediaDomainClean}/${folder}/`;
  if (base.startsWith(expectedPrefix)) {
    return false;
  }
  try {
    const parsed = new URL(u);
    const media = new URL(mediaDomainClean);
    if (parsed.hostname.toLowerCase() === media.hostname.toLowerCase()) {
      const path = parsed.pathname.replace(/^\//, '');
      return path.startsWith('blog/');
    }
  } catch {
    /* tratar como externa */
  }
  return true;
}

async function run() {
  console.log('Iniciando migración de imágenes de posts...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const postRepo = app.get<Repository<Post>>(getRepositoryToken(Post));
  const uploadService = app.get(UploadFileService);

  const mediaDomainClean = (process.env.MEDIA_DOMAIN || 'https://media.startcompanies.us').replace(
    /\/$/,
    '',
  );

  const posts = await postRepo.find({
    select: ['id', 'title', 'slug', 'content', 'image_url'],
  });

  console.log(`Total de posts: ${posts.length}\n`);

  let totalProcessed = 0;
  let totalImagesMigrated = 0;
  let postsUpdated = 0;
  let featuredImagesMigrated = 0;
  const errors: { postId: number; title: string; url: string; error: string }[] = [];

  const tryMigrateUrl = async (
    oldUrl: string,
    postId: number,
    title: string,
    folder: string,
  ): Promise<string | null> => {
    try {
      const { url: newUrl } = await uploadService.uploadFromUrl(oldUrl, folder);
      if (urlIdentity(newUrl) === urlIdentity(oldUrl)) {
        return null;
      }
      return newUrl.split('?')[0];
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`  ⚠ No se pudo migrar: ${oldUrl.slice(0, 80)}... → ${msg}`);
      errors.push({ postId, title, url: oldUrl, error: msg });
      return null;
    }
  };

  for (const post of posts) {
    let newImageUrl: string | null = null;
    let newContent: string | null = null;
    let contentReplaced = 0;
    const postTitle = (post.title || '').slice(0, 50);
    const slug = (post.slug || '').trim();
    const folder = slug
      ? uploadService.buildBlogImageFolder(slug)
      : 'blog';
    if (!slug) {
      console.warn(`Post ${post.id} sin slug; usando carpeta "blog" para migración.`);
    }

    // 1) Imagen destacada
    const currentFeatured = post.image_url;
    if (
      currentFeatured &&
      typeof currentFeatured === 'string' &&
      shouldConsiderForBlogMigration(currentFeatured, mediaDomainClean, folder)
    ) {
      const migrated = await tryMigrateUrl(currentFeatured, post.id, postTitle, folder);
      if (migrated) {
        newImageUrl = migrated;
        featuredImagesMigrated += 1;
        totalImagesMigrated += 1;
        console.log(`Post ${post.id} - "${postTitle}..." → image_url → ${migrated.slice(0, 90)}...`);
      }
    }

    // 2) Content: img src + srcset
    const content = post.content && typeof post.content === 'string' ? post.content : '';
    const urls = extractAllBlogImageUrls(content);
    const toMigrate = urls.filter((u) => shouldConsiderForBlogMigration(u, mediaDomainClean, folder));

    if (toMigrate.length > 0) {
      totalProcessed += 1;
      if (!newImageUrl) {
        console.log(
          `Post ${post.id} - "${postTitle}..." → ${toMigrate.length} URL(s) a revisar en content`,
        );
      }
      newContent = content;
      for (const oldUrl of toMigrate) {
        const newUrl = await tryMigrateUrl(oldUrl, post.id, postTitle, folder);
        if (newUrl) {
          newContent = newContent!.split(oldUrl).join(newUrl);
          contentReplaced += 1;
          totalImagesMigrated += 1;
        }
      }
      if (contentReplaced > 0) {
        console.log(`  ✓ ${contentReplaced} URL(s) sustituida(s) en content.`);
      }
    }

    const needsSave = newImageUrl !== null || (newContent !== null && contentReplaced > 0);
    if (needsSave) {
      const update: Partial<Post> = {};
      if (newImageUrl !== null) {
        update.image_url = newImageUrl;
      }
      if (newContent !== null && contentReplaced > 0) {
        update.content = newContent;
      }
      await postRepo.update({ id: post.id }, update);
      postsUpdated += 1;
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Posts con URLs candidatas en content: ${totalProcessed}`);
  console.log(`Imágenes destacadas (image_url) migradas: ${featuredImagesMigrated}`);
  console.log(`Posts actualizados: ${postsUpdated}`);
  console.log(`Total URLs migradas / reubicadas: ${totalImagesMigrated}`);
  if (errors.length > 0) {
    console.log(`Errores (no bloqueantes): ${errors.length}`);
    errors.slice(0, 15).forEach((e) =>
      console.log(`  - Post ${e.postId} | ${e.url.slice(0, 60)}... | ${e.error}`),
    );
  }

  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
