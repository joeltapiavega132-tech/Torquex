-- SQL applied through the Management API does not inherit the dashboard's
-- default table grants. Keep application tables closed to browser writes.
grant usage on schema public to authenticated, service_role;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- A browser must not write operational tables directly. The only mutation
-- path is the verified Edge Function and its service-role database call.
revoke insert, update, delete on all tables in schema public from anon, authenticated;
