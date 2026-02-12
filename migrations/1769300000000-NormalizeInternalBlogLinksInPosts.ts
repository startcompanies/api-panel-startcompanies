import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Actualización masiva: reemplaza en posts solo los enlaces (href) a businessenusa.com
 * por /blog/:slug con data-internal-blog="true". No afecta imágenes (src).
 */
export class NormalizeInternalBlogLinksInPosts1769300000000
  implements MigrationInterface
{
  name = 'NormalizeInternalBlogLinksInPosts1769300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE posts
      SET content = regexp_replace(
        content,
        'href=["'']https?://[^"''<>]*businessenusa\\.com/([^"''/?]+)/?["'']',
        'href="/blog/\\1" data-internal-blog="true"',
        'gi'
      )
      WHERE content ~ 'href=["'']https?://[^"''<>]*businessenusa\\.com';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No se revierte automáticamente: las URLs originales se perdieron.
    // Para revertir habría que tener un backup del content o un mapeo slug → URL.
  }
}
