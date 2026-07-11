-- Sprint 01C-3A: targeted privilege hardening for Supabase Security
-- Advisor findings raised after the Sprint 01B migration set was
-- applied to sabahlot-dev.
--
-- Postgres grants EXECUTE on every newly created function to PUBLIC by
-- default. Two SECURITY DEFINER trigger functions from Sprint 01B-1
-- never had that default grant explicitly revoked:
--   - public.handle_new_user()          (attached to auth.users)
--   - public.log_land_record_activity() (attached to public.land_records)
--
-- Both are `returns trigger` functions, so Postgres itself refuses to
-- execute them outside of trigger context ("trigger functions can only
-- be called as triggers") -- direct RPC/SQL invocation by anon or
-- authenticated is not actually possible today regardless of the
-- EXECUTE grant. This migration closes the Advisor finding anyway, as
-- defense-in-depth and least-privilege hygiene: it removes a dangling
-- default grant that serves no legitimate purpose, so the privilege
-- surface stays closed even if either function is ever refactored away
-- from `returns trigger` in the future.
--
-- public.log_activity() (also SECURITY DEFINER, but `returns void` and
-- therefore actually callable via RPC if left open) already had its
-- PUBLIC/anon/authenticated EXECUTE grants revoked in
-- 202607110011_create_activity_logs.sql -- not touched here.
--
-- No tables, RLS policies, data, or application code are changed by
-- this migration. Trigger invocation is not subject to EXECUTE-privilege
-- checks, so revoking EXECUTE here does not affect either trigger's
-- ability to run.

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

revoke execute on function public.log_land_record_activity() from public;
revoke execute on function public.log_land_record_activity() from anon;
revoke execute on function public.log_land_record_activity() from authenticated;
