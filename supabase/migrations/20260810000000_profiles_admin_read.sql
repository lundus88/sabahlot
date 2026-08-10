-- Sprint admin-dashboard, ADR-031.
--
-- NOT YET APPLIED to sabahlot-dev as of this file's creation (2026-08-10) --
-- the Supabase MCP server was disconnected for this entire sprint pass,
-- blocking both apply_migration and the sprint brief's own stop-condition
-- check (re-verifying profiles_select_own's live pg_policies text before
-- proceeding). Do not assume this policy is live just because this file
-- exists in the repo.
--
-- IMPORTANT: apply_migration assigns its own full-timestamp version at
-- call time, independent of this filename (the exact drift this repo's
-- 2026-08-07 Listing Partner migration-filename housekeeping pass had to
-- clean up after the fact -- see PROJECT_STATE.md). Once this migration
-- is actually applied, rename this file to match the version
-- apply_migration records in sabahlot-dev's schema_migrations table,
-- rather than leaving this placeholder name in place.
--
-- Adds exactly one new RLS policy -- same second-independent-permissive-
-- policy shape as ADR-029's listing_partners_select_admin. Grants read
-- only, alongside (never replacing) the existing profiles_select_own.
-- Postgres combines multiple permissive policies with OR, so this can
-- only ever ADD visibility for an admin caller, never narrow what a
-- non-admin user already sees of their own row. No INSERT/UPDATE/DELETE
-- policy is touched -- profiles_insert_own, profiles_update_own, and the
-- prevent_profile_role_escalation trigger are all unchanged.

create policy "profiles_select_admin"
  on public.profiles
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
