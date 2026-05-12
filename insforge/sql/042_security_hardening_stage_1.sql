-- Stage 1 security hardening without enabling RLS yet.
--
-- The application still performs many authenticated direct reads while the
-- staff and client portal screens are migrated towards tenant-aware RLS
-- policies. This migration removes the highest-risk anonymous mutation paths
-- and avoids app_* function EXECUTE being inherited through PUBLIC.

-- Anonymous clients must not be able to mutate business tables directly.
-- Keep SELECT temporarily so current server-rendered reads, tenant branding
-- and login/bootstrap discovery keep working until RLS policies are introduced.
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE USAGE, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Avoid future tables/sequences reintroducing anonymous mutation by default.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE ON TABLES FROM anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE USAGE, UPDATE ON SEQUENCES FROM anon;

-- Remove function execution inherited from PUBLIC. The app currently invokes
-- app_* RPCs through authenticated InsForge Functions, so grant that role
-- explicitly and do not expose those functions to anon through PUBLIC.
DO $$
DECLARE
  v_function REGPROCEDURE;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n
      ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE 'app\_%' ESCAPE '\'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
  END LOOP;
END;
$$;

-- Harden SECURITY DEFINER functions flagged by the advisor. These functions
-- intentionally remain SECURITY DEFINER because they need privileged reads or
-- writes, but their search_path must stay explicit.
ALTER FUNCTION public.app_find_auth_user_id_by_email(UUID, TEXT)
  SET search_path = public, auth;

ALTER FUNCTION public.app_is_staff_email_verified(UUID, UUID)
  SET search_path = public, auth;

ALTER FUNCTION public.app_get_staff_verification_states(UUID)
  SET search_path = public, auth;

ALTER FUNCTION public.app_manually_activate_client_portal_account(UUID, UUID, UUID, TEXT)
  SET search_path = public, auth;

ALTER FUNCTION public.app_renew_pass(UUID, UUID, UUID, TEXT, NUMERIC, DATE, TEXT)
  SET search_path = public;

