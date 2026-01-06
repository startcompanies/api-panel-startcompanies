-- Script adicional para otorgar privilegios en el esquema público
-- Este script debe ejecutarse conectado a la base de datos bot_start

GRANT ALL ON SCHEMA public TO bot_start;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO bot_start;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO bot_start;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO bot_start;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO bot_start;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO bot_start;

