-- Script para crear usuario y base de datos bot_start
-- DB_USER=bot_start
-- DB_PASSWORD=3dbmNiBriGNGY4Wf
-- DB_NAME=bot_start

-- Crear o actualizar el usuario
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_user WHERE usename = 'bot_start') THEN
    CREATE USER bot_start WITH PASSWORD '3dbmNiBriGNGY4Wf';
  ELSE
    ALTER USER bot_start WITH PASSWORD '3dbmNiBriGNGY4Wf';
  END IF;
END
$$;
