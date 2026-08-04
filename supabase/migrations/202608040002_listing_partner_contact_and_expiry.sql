-- Sprint listing-partner-decisions-migration: implements the 2 of
-- ADR-027's 5 owner decisions that actually require a schema/RLS
-- change (items 2-4 -- ren_number optional, photos deferred, admin
-- provisioning manual -- need no code, see the ADR).
--
-- 1. Contact-info exposure (ADR-027 item 1): a SECURITY DEFINER
--    function, mirroring handle_new_user()'s existing pattern in
--    create_profiles.sql -- does exactly one narrow, safe thing.
--    Returns a row only when the given listing is active, its parent
--    partner is approved, AND the partner has explicitly consented.
--    listing_partners' own RLS is entirely unchanged by this migration
--    -- this function is the only new path by which phone/email become
--    reachable by anon, and only under all three conditions, evaluated
--    fresh on every call.
--
-- 2. Listing lifecycle (ADR-027 item 5): property_listings_select_public
--    gains a `updated_at > now() - 90 days` condition. A stale `active`
--    listing silently stops appearing in public SELECT results --
--    `status` itself is never mutated (no cron/scheduled-job
--    infrastructure exists anywhere in this repo; this is a virtual
--    expiry via RLS only). A partner re-saving any field resets
--    `updated_at` and un-expires the listing -- the intended refresh
--    mechanism, not a workaround.

create or replace function public.get_active_listing_contact(listing_id uuid)
returns table(phone text, email text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select lp.phone, lp.email
    from public.property_listings pl
    join public.listing_partners lp on lp.id = pl.partner_id
    where pl.id = listing_id
      and pl.status = 'active'
      and lp.status = 'approved'
      and lp.public_contact_consent = true;
end;
$$;

comment on function public.get_active_listing_contact(uuid) is
  'Sprint listing-partner-decisions-migration (ADR-027 item 1): the only path by which listing_partners.phone/email become reachable by anon. Returns zero rows unless the listing is active, its partner is approved, and the partner has explicitly set public_contact_consent = true -- all three re-checked on every call, never cached.';

grant execute on function public.get_active_listing_contact(uuid) to anon, authenticated;

drop policy if exists "property_listings_select_public" on public.property_listings;
create policy "property_listings_select_public"
  on public.property_listings
  for select
  to anon, authenticated
  using (
    status = 'active'
    and updated_at > (now() - interval '90 days')
    and exists (
      select 1
      from public.listing_partners lp
      where lp.id = property_listings.partner_id
        and lp.status = 'approved'
    )
  );
