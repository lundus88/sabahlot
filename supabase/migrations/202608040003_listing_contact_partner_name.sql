-- Sprint listing-partner-public-directory-ui: extends
-- get_active_listing_contact (ADR-027 item 1) to also return the
-- posting partner's display_name/company_name, not just phone/email.
--
-- Owner decision 2026-08-04 (docs/ai/SPRINT_BRIEF_listing-partner-public-directory-ui.md,
-- "Decided" section): without this, a public listing page had no way to
-- show who posted it, even after contact reveal -- listing_partners has
-- zero anon read access on any column (ADR-026), and this function was
-- the only path anon ever gets any of its data through at all. Same
-- three-condition gate as before (listing active + partner approved +
-- partner consented), now applied to display_name/company_name too --
-- never a separately-less-gated path for the name vs. the contact
-- details.

-- Postgres does not allow CREATE OR REPLACE to change a table-returning
-- function's return shape (the row type from its OUT parameters) -- the
-- old two-column signature must be dropped first. This also drops the
-- function's EXECUTE grants, so they are explicitly re-issued below;
-- there is a brief window during this migration where the function does
-- not exist at all, which is fine (DDL is transactional; no caller can
-- observe an in-between state).
drop function if exists public.get_active_listing_contact(uuid);

create function public.get_active_listing_contact(listing_id uuid)
returns table(phone text, email text, display_name text, company_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select lp.phone, lp.email, lp.display_name, lp.company_name
    from public.property_listings pl
    join public.listing_partners lp on lp.id = pl.partner_id
    where pl.id = listing_id
      and pl.status = 'active'
      and lp.status = 'approved'
      and lp.public_contact_consent = true;
end;
$$;

comment on function public.get_active_listing_contact(uuid) is
  'Sprint listing-partner-public-directory-ui: extended to also return display_name/company_name (previously phone/email only) -- same three-condition gate as before (listing active + partner approved + partner consented). The only path by which any listing_partners column ever becomes reachable by anon.';

grant execute on function public.get_active_listing_contact(uuid) to anon, authenticated;
