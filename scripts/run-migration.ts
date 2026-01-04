import 'reflect-metadata';
import { execSync } from 'child_process';
import * as path from 'path';

const command = process.argv[2];
const migrationName = process.argv[3];

if (!command) {
  console.error('❌ Error: Debes especificar un comando (generate, create, run, revert, show)');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');

try {
  switch (command) {
    case 'generate':
      if (!migrationName) {
        console.error('❌ Error: Debes especificar un nombre para la migración');
        console.log('Uso: npm run migration:generate -- NombreDeLaMigracion');
        process.exit(1);
      }
      console.log(`📝 Generando migración: ${migrationName}...`);
      execSync(
        `npx typeorm-ts-node-commonjs migration:generate migrations/${migrationName} -d src/data-source.ts`,
        { stdio: 'inherit', cwd: projectRoot },
      );
      console.log(`✅ Migración generada exitosamente`);
      break;

    case 'create':
      if (!migrationName) {
        console.error('❌ Error: Debes especificar un nombre para la migración');
        console.log('Uso: npm run migration:create -- NombreDeLaMigracion');
        process.exit(1);
      }
      console.log(`📝 Creando migración vacía: ${migrationName}...`);
      execSync(
        `npx typeorm-ts-node-commonjs migration:create migrations/${migrationName}`,
        { stdio: 'inherit', cwd: projectRoot },
      );
      console.log(`✅ Migración creada exitosamente`);
      break;

    case 'run':
      console.log('🚀 Ejecutando migraciones pendientes...');
      execSync(`npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
      console.log('✅ Migraciones ejecutadas exitosamente');
      break;

    case 'revert':
      console.log('⏪ Revirtiendo última migración...');
      execSync(`npx typeorm-ts-node-commonjs migration:revert -d src/data-source.ts`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
      console.log('✅ Migración revertida exitosamente');
      break;

    case 'show':
      console.log('📊 Estado de las migraciones:');
      execSync(`npx typeorm-ts-node-commonjs migration:show -d src/data-source.ts`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
      break;

    default:
      console.error(`❌ Error: Comando desconocido: ${command}`);
      console.log('Comandos disponibles: generate, create, run, revert, show');
      process.exit(1);
  }
} catch (error) {
  console.error('❌ Error ejecutando migración:', error);
  process.exit(1);
}








