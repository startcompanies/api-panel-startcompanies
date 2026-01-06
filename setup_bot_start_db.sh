#!/bin/bash
# Script para ejecutar la creación de usuario y base de datos en el contenedor Docker

CONTAINER_ID="84e596a26a3c"

echo "Conectando al contenedor $CONTAINER_ID..."
echo "Creando usuario bot_start y base de datos bot_start..."

# Verificar si la base de datos ya existe
DB_EXISTS=$(docker exec $CONTAINER_ID psql -U root -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='bot_start'")

if [ "$DB_EXISTS" = "1" ]; then
    echo "La base de datos bot_start ya existe. Actualizando usuario..."
else
    echo "Creando base de datos bot_start..."
    # Copiar y ejecutar script para crear la base de datos
    docker cp create_bot_start_db_database.sql $CONTAINER_ID:/tmp/create_bot_start_db_database.sql
    docker exec -i $CONTAINER_ID psql -U root -d postgres -f /tmp/create_bot_start_db_database.sql
    docker exec $CONTAINER_ID rm /tmp/create_bot_start_db_database.sql
fi

# Copiar los scripts SQL al contenedor
docker cp create_bot_start_db.sql $CONTAINER_ID:/tmp/create_bot_start_db.sql
docker cp setup_bot_start_db_privileges.sql $CONTAINER_ID:/tmp/setup_bot_start_db_privileges.sql

# Ejecutar el script SQL para crear/actualizar el usuario
echo "Creando/actualizando usuario bot_start..."
docker exec -i $CONTAINER_ID psql -U root -d postgres -f /tmp/create_bot_start_db.sql

# Otorgar privilegios en el esquema público
echo "Otorgando privilegios en el esquema público..."
docker exec -i $CONTAINER_ID psql -U root -d bot_start -f /tmp/setup_bot_start_db_privileges.sql

# Limpiar los archivos temporales del contenedor
docker exec $CONTAINER_ID rm /tmp/create_bot_start_db.sql /tmp/setup_bot_start_db_privileges.sql

echo "¡Proceso completado!"
echo ""
echo "Detalles de la conexión:"
echo "  DB_HOST=bot-api-db-qpkm1f"
echo "  DB_PORT=5432"
echo "  DB_NAME=bot_start"
echo "  DB_USER=bot_start"
echo "  DB_PASSWORD=3dbmNiBriGNGY4Wf"

