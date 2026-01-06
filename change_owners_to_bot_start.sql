-- Script para cambiar el owner de todas las tablas, secuencias y esquemas a bot_start

DO $$
DECLARE
    r RECORD;
BEGIN
    -- Cambiar owner del esquema public
    ALTER SCHEMA public OWNER TO bot_start;
    
    -- Cambiar owner de todas las tablas
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' OWNER TO bot_start;';
    END LOOP;
    
    -- Cambiar owner de todas las secuencias
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public') LOOP
        EXECUTE 'ALTER SEQUENCE public.' || quote_ident(r.sequence_name) || ' OWNER TO bot_start;';
    END LOOP;
    
    -- Cambiar owner de todas las funciones
    FOR r IN (
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
    ) LOOP
        EXECUTE 'ALTER FUNCTION public.' || quote_ident(r.proname) || '(' || r.args || ') OWNER TO bot_start;';
    END LOOP;
END
$$;

