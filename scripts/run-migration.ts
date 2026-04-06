import 'reflect-metadata';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import * as path from 'path';

const command = process.argv[2];
const migrationName = process.argv[3];

if (!command) {
  console.error('❌ Error: Debes especificar un comando (generate, create, run, revert, show)');
  process.exit(1);
}

const projectRoot = path.join(__dirname, '..');

const isCompiledDist =
  existsSync(path.join(projectRoot, 'src', 'data-source.js')) &&
  !existsSync(path.join(projectRoot, 'src', 'data-source.ts'));

const dataSourcePath = isCompiledDist ? 'src/data-source.js' : 'src/data-source.ts';
const typeormCli = isCompiledDist ? 'npx typeorm' : 'npx typeorm-ts-node-commonjs';

try {
  switch (command) {
    case 'generate':
      if (!migrationName) {
        console.error('❌ Error: Debes especificar un nombre para la migración');
        console.log('Uso: npm run migration:generate -- NombreDeLaMigracion');
        process.exit(1);
      }
      if (isCompiledDist) {
        console.error('❌ Error: migration:generate no está soportado en modo compilado (dist).');
        console.log('Usa este comando en desarrollo (ts-node) desde el código fuente.');
        process.exit(1);
      }
      console.log(`📝 Generando migración: ${migrationName}...`);
      execSync(
        `npx typeorm-ts-node-commonjs migration:generate src/migrations/${migrationName} -d src/data-source.ts`,
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
      if (isCompiledDist) {
        console.error('❌ Error: migration:create no está soportado en modo compilado (dist).');
        console.log('Usa este comando en desarrollo (ts-node) desde el código fuente.');
        process.exit(1);
      }
      console.log(`📝 Creando migración vacía: ${migrationName}...`);
      execSync(
        `npx typeorm-ts-node-commonjs migration:create src/migrations/${migrationName}`,
        { stdio: 'inherit', cwd: projectRoot },
      );
      console.log(`✅ Migración creada exitosamente`);
      break;

    case 'run':
      console.log('🚀 Ejecutando migraciones pendientes...');
      execSync(`${typeormCli} migration:run -d ${dataSourcePath}`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
      console.log('✅ Migraciones ejecutadas exitosamente');
      break;

    case 'revert':
      console.log('⏪ Revirtiendo última migración...');
      execSync(`${typeormCli} migration:revert -d ${dataSourcePath}`, {
        stdio: 'inherit',
        cwd: projectRoot,
      });
      console.log('✅ Migración revertida exitosamente');
      break;

    case 'show':
      console.log('📊 Estado de las migraciones:');
      execSync(`${typeormCli} migration:show -d ${dataSourcePath}`, {
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










