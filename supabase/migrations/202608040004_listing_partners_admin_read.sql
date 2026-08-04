-- Sprint: sprint-listing-partner-admin-approval-ui
--
-- Adds the first genuinely admin-broad-read policy for listing_partners.
-- Until now, admins could UPDATE any row's status (listing_partners_update_admin)
-- but had no way to SELECT rows belonging to other partners -- there was no
-- query path for an admin to discover who is pending review at all.
--
-- This is a second, independent permissive SELECT policy alongside the
-- existing listing_partners_select_own. Postgres combines multiple permissive
-- policies with OR, so this only ever adds visibility for an admin caller; it
-- cannot narrow what listing_partners_select_own already allows a non-admin
-- partner to see of their own row.

create policy "listing_partners_select_admin"
  on public.listing_partners
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
