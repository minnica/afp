SELECT json_build_object(
'functions', (SELECT json_agg(t ORDER BY name) FROM (SELECT p.proname AS name, pg_get_function_identity_arguments(p.oid) AS arguments, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')) t),
'event_triggers', (SELECT json_agg(t ORDER BY name) FROM (SELECT e.evtname AS name, e.evtevent AS event, e.evtenabled AS enabled, e.evttags AS tags, e.evtfoid::regproc::text AS function FROM pg_event_trigger e WHERE e.evtfoid='public.rls_auto_enable()'::regprocedure) t)
) AS automation;
