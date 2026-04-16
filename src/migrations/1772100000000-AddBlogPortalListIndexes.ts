import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Índices para listados del blog en portal:
 * - posts filtrados por is_published + orden published_at
 * - posts filtrados por sandbox + orden published_at
 * - joins post_categories / post_tags (evita seq scan en categorías)
 */
export class AddBlogPortalListIndexes1772100000000 implements MigrationInterface {
  name = 'AddBlogPortalListIndexes1772100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_posts_is_published_published_at"
      ON "posts" ("is_published", "published_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_posts_sandbox_published_at"
      ON "posts" ("sandbox", "published_at" DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_post_categories_category_id"
      ON "post_categories" ("category_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_post_categories_post_id"
      ON "post_categories" ("post_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_post_tags_post_id"
      ON "post_tags" ("post_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_post_tags_tag_id"
      ON "post_tags" ("tag_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_tags_tag_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_tags_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_categories_post_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_post_categories_category_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_posts_sandbox_published_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_posts_is_published_published_at"`);
  }
}
