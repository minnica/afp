-- A11: versiona la denegación pública existente. Prisma usa el propietario
-- desde el servidor; la autorización por usuario sigue siendo obligatoria.
-- No crea políticas, cambia grants ni fuerza RLS sobre el propietario.
BEGIN;

ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."card_cycles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."card_cycle_credits" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."people" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."income_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."daily_expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."expense_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."installment_purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscription_charges" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."receivable_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payable_accounts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."incomes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notice_dismissals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Conserva también el automatismo existente para futuras tablas públicas.
-- Event triggers requieren superusuario en PostgreSQL o postgres con Supautils
-- en Supabase. Se conserva la definición observada, incluido su registro de errores.
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
        CREATE EVENT TRIGGER ensure_rls ON ddl_command_end
            WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
            EXECUTE FUNCTION public.rls_auto_enable();
    END IF;
END $$;

COMMIT;
