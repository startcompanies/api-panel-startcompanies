# Script PowerShell para ejecutar la creación de usuario y base de datos en el contenedor Docker

$CONTAINER_ID = "84e596a26a3c"

Write-Host "Conectando al contenedor $CONTAINER_ID..." -ForegroundColor Green
Write-Host "Creando usuario bot_start y base de datos bot_start..." -ForegroundColor Yellow

# Primero: Crear el usuario
Write-Host "Paso 1: Creando/actualizando usuario bot_start..." -ForegroundColor Yellow
docker cp create_bot_start_db.sql ${CONTAINER_ID}:/tmp/create_bot_start_db.sql
docker exec -i $CONTAINER_ID psql -U root -d postgres -f /tmp/create_bot_start_db.sql

# Segundo: Verificar si la base de datos ya existe y crearla si no existe
Write-Host "Paso 2: Verificando/creando base de datos bot_start..." -ForegroundColor Yellow
$dbExists = docker exec $CONTAINER_ID psql -U root -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bot_start'" 2>&1

if ($dbExists -match "1") {
    Write-Host "La base de datos bot_start ya existe." -ForegroundColor Green
} else {
    Write-Host "Creando base de datos bot_start..." -ForegroundColor Yellow
    docker cp create_bot_start_db_database.sql ${CONTAINER_ID}:/tmp/create_bot_start_db_database.sql
    docker exec -i $CONTAINER_ID psql -U root -d postgres -f /tmp/create_bot_start_db_database.sql
    docker exec $CONTAINER_ID rm /tmp/create_bot_start_db_database.sql
}

# Tercero: Otorgar privilegios adicionales en la base de datos
Write-Host "Paso 3: Otorgando privilegios en la base de datos..." -ForegroundColor Yellow
docker exec -i $CONTAINER_ID psql -U root -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE bot_start TO bot_start;"

# Copiar script de privilegios del esquema
docker cp setup_bot_start_db_privileges.sql ${CONTAINER_ID}:/tmp/setup_bot_start_db_privileges.sql

# Otorgar privilegios en el esquema público
Write-Host "Otorgando privilegios en el esquema público..." -ForegroundColor Yellow
docker exec -i $CONTAINER_ID psql -U root -d bot_start -f /tmp/setup_bot_start_db_privileges.sql

# Limpiar los archivos temporales del contenedor
docker exec $CONTAINER_ID rm /tmp/create_bot_start_db.sql /tmp/setup_bot_start_db_privileges.sql

Write-Host "¡Proceso completado!" -ForegroundColor Green
Write-Host ""
Write-Host "Detalles de la conexión:" -ForegroundColor Cyan
Write-Host "  DB_HOST=bot-api-db-qpkm1f"
Write-Host "  DB_PORT=5432"
Write-Host "  DB_NAME=bot_start"
Write-Host "  DB_USER=bot_start"
Write-Host "  DB_PASSWORD=3dbmNiBriGNGY4Wf"

