# Script PowerShell para migrar la base de datos startcompaniesDB a bot_start
# Container ID: 84e596a26a3c

$CONTAINER_ID = "84e596a26a3c"
$SOURCE_DB = "startcompaniesDB"
$TARGET_DB = "bot_start"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Migración de Base de Datos" -ForegroundColor Cyan
Write-Host "De: $SOURCE_DB" -ForegroundColor Yellow
Write-Host "A: ${TARGET_DB}" -ForegroundColor Yellow
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Paso 1: Limpiar la base de datos destino
Write-Host "Paso 1: Limpiando base de datos destino..." -ForegroundColor Yellow
docker exec $CONTAINER_ID psql -U root -d postgres -c "DROP DATABASE IF EXISTS ${TARGET_DB};" 2>&1 | Out-Null
docker exec $CONTAINER_ID psql -U root -d postgres -c "CREATE DATABASE ${TARGET_DB} OWNER bot_start;" 2>&1 | Out-Null

Write-Host ""

# Paso 2: Hacer dump y restaurar directamente usando pipe
Write-Host "Paso 2: Migrando esquema y datos..." -ForegroundColor Green
docker exec $CONTAINER_ID pg_dump -U root -d $SOURCE_DB --no-owner --no-privileges | docker exec -i $CONTAINER_ID psql -U root -d ${TARGET_DB} 2>&1 | Select-String -Pattern "ERROR" -NotMatch | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "Advertencia: Puede haber habido errores durante la migración" -ForegroundColor Yellow
}

Write-Host ""

# Paso 3: Cambiar el owner de todas las tablas, secuencias y esquemas
Write-Host "Paso 3: Cambiando ownership a bot_start..." -ForegroundColor Green
docker cp change_owners_to_bot_start.sql ${CONTAINER_ID}:/tmp/change_owners_to_bot_start.sql
docker exec -i $CONTAINER_ID psql -U root -d ${TARGET_DB} -f /tmp/change_owners_to_bot_start.sql 2>&1 | Out-Null
docker exec $CONTAINER_ID rm /tmp/change_owners_to_bot_start.sql

Write-Host ""

# Paso 4: Otorgar todos los privilegios
Write-Host "Paso 4: Otorgando privilegios..." -ForegroundColor Green
docker exec $CONTAINER_ID psql -U root -d ${TARGET_DB} -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bot_start;" 2>&1 | Out-Null
docker exec $CONTAINER_ID psql -U root -d ${TARGET_DB} -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bot_start;" 2>&1 | Out-Null
docker exec $CONTAINER_ID psql -U root -d ${TARGET_DB} -c "GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO bot_start;" 2>&1 | Out-Null
docker exec $CONTAINER_ID psql -U root -d ${TARGET_DB} -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bot_start;" 2>&1 | Out-Null
docker exec $CONTAINER_ID psql -U root -d ${TARGET_DB} -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bot_start;" 2>&1 | Out-Null

Write-Host ""

# Paso 5: Verificar la migración
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "¡Migración completada!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verificando tablas en ${TARGET_DB}:" -ForegroundColor Cyan
docker exec $CONTAINER_ID psql -U bot_start -d ${TARGET_DB} -c "\dt"

Write-Host ""
Write-Host "Contando registros por tabla:" -ForegroundColor Cyan
docker exec $CONTAINER_ID psql -U bot_start -d ${TARGET_DB} -c "SELECT 'categories' as tabla, COUNT(*)::text as registros FROM categories UNION ALL SELECT 'posts', COUNT(*)::text FROM posts UNION ALL SELECT 'users', COUNT(*)::text FROM users UNION ALL SELECT 'tags', COUNT(*)::text FROM tags UNION ALL SELECT 'reusable_elements', COUNT(*)::text FROM reusable_elements UNION ALL SELECT 'post_categories', COUNT(*)::text FROM post_categories UNION ALL SELECT 'post_tags', COUNT(*)::text FROM post_tags ORDER BY tabla;"

