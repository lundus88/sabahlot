-- Sprint admin-dashboard, ADR-031.
--
-- Applied to sabahlot-dev 2026-08-13 (version 20260813073735, matching this
-- filename). Stop-condition re-verified before applying: profiles_select_own's
-- live pg_policies text matched exactly (( select auth.uid()) = id), and no
-- pre-existing profiles_select_admin policy existed. Post-apply verification:
-- pg_policies confirms the policy live, PERMISSIVE, exact expected qual; a
-- fresh get_advisors (security) shows the same 3 pre-existing findings only
-- (1 INFO activity_logs, 2 WARN get_active_listing_contact's deliberate
-- design) -- no new finding introduced.
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
