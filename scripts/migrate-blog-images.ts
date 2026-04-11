/**
 * Script para migrar imágenes de los posts del blog:
 * - Recorre todos los posts
 * - image_url (imagen destacada): si es externa o está en media sin /blog/, la sube a blog/{slug}/ y actualiza
 * - content: detecta <img src="..."> con URLs externas (ej. businessenusa.com), las sube a blog/{slug}/ y reemplaza
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

const IMG_SRC_REGEX = /<img[^>]+src=["']([^"']+)["']/gi;

function extractImageUrls(html: string): string[] {
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  IMG_SRC_REGEX.lastIndex = 0;
  while ((m = IMG_SRC_REGEX.exec(html)) !== null) {
    urls.push(m[1].trim());
  }
  return [...new Set(urls)];
}

/** true si la URL debe migrarse a blog/ (externa o en media pero sin /blog/) */
function shouldMigrateUrl(url: string, blogPrefix: string): boolean {
  const u = (url || '').trim();
  if (!u.startsWith('http://') && !u.startsWith('https://')) return false;
  if (u.startsWith(blogPrefix)) return false; // ya está en blog/
  return true;
}

async function run() {
  console.log('Iniciando migración de imágenes de posts...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const postRepo = app.get<Repository<Post>>(getRepositoryToken(Post));
  const uploadService = app.get(UploadFileService);

  const mediaDomain = (process.env.MEDIA_DOMAIN || 'https://media.startcompanies.us').replace(/\/$/, '');
  const blogPrefix = `${mediaDomain}/blog/`;

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
      return newUrl && newUrl !== oldUrl ? newUrl : null;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.warn(`  ⚠ No se pudo migrar: ${oldUrl.slice(0, 60)}... → ${msg}`);
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

    // 1) Imagen destacada (image_url): migrar si es externa o no está en blog/
    const currentFeatured = post.image_url;
    if (currentFeatured && typeof currentFeatured === 'string' && shouldMigrateUrl(currentFeatured, blogPrefix)) {
      const migrated = await tryMigrateUrl(currentFeatured, post.id, postTitle, folder);
      if (migrated) {
        newImageUrl = migrated;
        featuredImagesMigrated += 1;
        totalImagesMigrated += 1;
        console.log(`Post ${post.id} - "${postTitle}..." → image_url migrada a ${folder}/`);
      }
    }

    // 2) Imágenes dentro del content
    const content = post.content && typeof post.content === 'string' ? post.content : '';
    const urls = extractImageUrls(content);
    const external = urls.filter((url) => shouldMigrateUrl(url, blogPrefix));

    if (external.length > 0) {
      totalProcessed += 1;
      if (!newImageUrl) console.log(`Post ${post.id} - "${postTitle}..." → ${external.length} imagen(es) en content`);
      newContent = content;
      for (const oldUrl of external) {
        const newUrl = await tryMigrateUrl(oldUrl, post.id, postTitle, folder);
        if (newUrl) {
          newContent = newContent!.split(oldUrl).join(newUrl);
          contentReplaced += 1;
          totalImagesMigrated += 1;
        }
      }
      if (contentReplaced > 0) console.log(`  ✓ ${contentReplaced} imagen(es) en content migrada(s).`);
    }

    const needsSave = newImageUrl !== null || (newContent !== null && contentReplaced > 0);
    if (needsSave) {
      const update: Partial<Post> = {};
      if (newImageUrl !== null) update.image_url = newImageUrl;
      if (newContent !== null && contentReplaced > 0) update.content = newContent;
      await postRepo.update({ id: post.id }, update);
      postsUpdated += 1;
    }
  }

  console.log('\n--- Resumen ---');
  console.log(`Posts con imágenes en content a migrar: ${totalProcessed}`);
  console.log(`Imágenes destacadas (image_url) migradas: ${featuredImagesMigrated}`);
  console.log(`Posts actualizados: ${postsUpdated}`);
  console.log(`Total imágenes migradas: ${totalImagesMigrated}`);
  if (errors.length > 0) {
    console.log(`Errores (no bloqueantes): ${errors.length}`);
    errors.slice(0, 10).forEach((e) => console.log(`  - Post ${e.postId} | ${e.url.slice(0, 50)}... | ${e.error}`));
  }

  await app.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
