-- Security hardening for the public listing-contact reveal RPC.
--
-- Intent is unchanged: anon/authenticated callers may reveal only the
-- posting partner's public contact/name fields, and only when the listing
-- is genuinely public. This migration aligns the RPC with the existing
-- 90-day public-listing visibility rule and narrows SECURITY DEFINER risk.

create or replace function public.get_active_listing_contact(listing_id uuid)
returns table(phone text, email text, display_name text, company_name text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  return query
    select lp.phone, lp.email, lp.display_name, lp.company_name
    from public.property_listings pl
    join public.listing_partners lp on lp.id = pl.partner_id
    where pl.id = listing_id
      and pl.status = 'active'
      and pl.updated_at > (now() - interval '90 days')
      and lp.status = 'approved'
      and lp.public_contact_consent = true;
end;
$$;

comment on function public.get_active_listing_contact(uuid) is
  'Public contact-reveal RPC. Returns contact/name only for a fresh active listing (updated within 90 days) whose partner is approved and has explicitly consented to public contact exposure. SECURITY DEFINER is intentional because listing_partners has no anonymous row access; all table references are schema-qualified and search_path is locked to pg_catalog.';

revoke all on function public.get_active_listing_contact(uuid) from public;
grant execute on function public.get_active_listing_contact(uuid) to anon, authenticated;
