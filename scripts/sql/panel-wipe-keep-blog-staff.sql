-- =============================================================================
-- PELIGRO: borra datos operativos del panel y usuarios client/partner.
-- Omite tablas que no existan en la BD (schemas distintos / migraciones pendientes).
--
-- CONSERVA: blog (posts, categories, tags, junctions, reusable_elements),
--   users type IN ('admin', 'user', 'editor') y autores en posts.user_id.
--
-- Local:  npm run db:wipe-panel -- --yes
-- Prod:   NODE_ENV=production PANEL_WIPE_ALLOW_IN_PRODUCTION=1 npm run db:wipe-panel:prod -- --yes
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _preserved_users (id int PRIMARY KEY) ON COMMIT DROP;

INSERT INTO _preserved_users (id)
SELECT id FROM users WHERE type IN ('admin', 'user', 'editor');

DO $$
BEGIN
  IF to_regclass('public.posts') IS NOT NULL THEN
    INSERT INTO _preserved_users (id)
    SELECT DISTINCT user_id FROM posts WHERE user_id IS NOT NULL
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- Panel: orden respetando FKs típicas
DO $$ BEGIN IF to_regclass('public.notifications') IS NOT NULL THEN DELETE FROM notifications; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.documents') IS NOT NULL THEN DELETE FROM documents; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.process_steps') IS NOT NULL THEN DELETE FROM process_steps; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.members') IS NOT NULL THEN DELETE FROM members; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.bank_account_owners') IS NOT NULL THEN DELETE FROM bank_account_owners; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.bank_account_validators') IS NOT NULL THEN DELETE FROM bank_account_validators; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.zoho_deal_timeline') IS NOT NULL THEN DELETE FROM zoho_deal_timeline; END IF; END $$;

DO $$ BEGIN IF to_regclass('public.apertura_llc_requests') IS NOT NULL THEN DELETE FROM apertura_llc_requests; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.renovacion_llc_requests') IS NOT NULL THEN DELETE FROM renovacion_llc_requests; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.cuenta_bancaria_requests') IS NOT NULL THEN DELETE FROM cuenta_bancaria_requests; END IF; END $$;

DO $$ BEGIN IF to_regclass('public.requests') IS NOT NULL THEN DELETE FROM requests; END IF; END $$;
DO $$ BEGIN IF to_regclass('public.clients') IS NOT NULL THEN DELETE FROM clients; END IF; END $$;

-- TypeORM sin name explícito: columna "userId" (camelCase) en estas tablas
DO $$ BEGIN IF to_regclass('public.trusted_login_devices') IS NOT NULL THEN
  DELETE FROM trusted_login_devices WHERE "userId" NOT IN (SELECT id FROM _preserved_users);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.login_otp_challenges') IS NOT NULL THEN
  DELETE FROM login_otp_challenges WHERE "userId" NOT IN (SELECT id FROM _preserved_users);
END IF; END $$;
DO $$ BEGIN IF to_regclass('public.user_preferences') IS NOT NULL THEN
  DELETE FROM user_preferences WHERE user_id NOT IN (SELECT id FROM _preserved_users);
END IF; END $$;

DELETE FROM users WHERE id NOT IN (SELECT id FROM _preserved_users);

COMMIT;
