/**
 * Script para sincronizar el campo description de los posts desde
 * businessenusa-migration-meta.json: busca por slug, valida title y actualiza description.
 *
 * Uso: npm run sync:post-descriptions [ruta-opcional-al-json]
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PostsService } from '../src/blog/posts/posts.service';

async function run() {
  const jsonPath = process.argv[2]; // opcional
  console.log('Sincronizando descriptions desde migration meta...\n');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const postsService = app.get(PostsService);
  const result = await postsService.syncDescriptionsFromMigrationMeta(jsonPath);

  console.log('Resultado:');
  console.log(`  Actualizados: ${result.updated}`);
  console.log(`  No encontrado (slug): ${result.notFound}`);
  if (result.details.length) {
    console.log('\nDetalle por slug:');
    result.details.forEach((d) => console.log(`  - ${d.slug}: ${d.status}`));
  }
  await app.close();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
