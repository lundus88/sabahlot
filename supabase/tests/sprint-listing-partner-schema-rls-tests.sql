-- Sprint listing-partner-schema: RLS test plan for listing_partners +
-- property_listings.
--
-- STATUS: NOT EXECUTED against sabahlot-dev in this sprint. Same
-- reasoning as supabase/tests/sprint-01b1-data-isolation-tests.sql:
-- listing_partners.id has a hard FK to auth.users, so exercising the
-- INSERT/UPDATE scenarios below for real requires either (a) real
-- auth.users rows already present in the target project, or (b)
-- inserting temporary auth.users rows directly via raw SQL, which
-- Supabase's own guidance advises against (auth.users has internal
-- GoTrue-managed constraints/state not meant to be written to
-- directly, even inside a transaction that gets rolled back). Neither
-- was available/authorized in this pass. What WAS verified for real
-- against sabahlot-dev in this sprint: rls_enabled=true on both new
-- tables, and every policy's `qual`/`with_check` text read back via
-- pg_policies matches this file's intent exactly (see the sprint
-- report). This file documents the intended session-level behavior for
-- a later pass that has real (or deliberately-seeded) auth.users test
-- identities to run it against.
--
-- How this is meant to be run (later, not now): each block wrapped in
-- `begin ... rollback;`, using `set local role` + `set local
-- request.jwt.claims` to simulate a session, exactly like
-- sprint-01b1-data-isolation-tests.sql. Replace '<partner-a-uuid>' /
-- '<partner-b-uuid>' / '<admin-uuid>' with real auth.users ids from the
-- target project before running.

-- ============================================================
-- Scenario 1-2: partner self-registration
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';

-- Scenario 1: Partner A registers themself, starting pending.
insert into public.listing_partners (id, display_name, phone, email)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com')
returning id, status;
-- Expect: 1 row inserted, status = 'pending'.

-- Scenario 2: Partner A tries to self-register as already-approved.
insert into public.listing_partners (id, display_name, phone, email, status)
values ('<partner-a-uuid>', 'Test Partner A 2', '+60123456789', 'a2@example.com', 'approved');
-- Expect: INSERT rejected (RLS with_check violation) -- status must be
-- 'pending' on self-registration, id conflict aside.

rollback;

-- ============================================================
-- Scenario 3-4: self-approval blocked (trigger backstop)
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com');

-- Scenario 3: Partner A tries to self-approve.
update public.listing_partners
set status = 'approved'
where id = '<partner-a-uuid>';
-- Expect: exception raised by prevent_listing_partner_self_approval()
-- ("Only an admin may change listing_partners.status."), not a silent
-- 0-row UPDATE -- the row IS visible/owned (listing_partners_update_own
-- would otherwise allow the UPDATE), so this proves the TRIGGER layer
-- is the one doing the blocking, not just RLS row-matching.

-- Scenario 4: Partner A updates a non-status field on their own row
-- (sanity check the trigger does not over-block ordinary self-edits).
update public.listing_partners
set bio = 'Updated bio'
where id = '<partner-a-uuid>';
-- Expect: UPDATE 1, succeeds (status unchanged, trigger's `if` body
-- never enters).

rollback;

-- ============================================================
-- Scenario 5: admin approval path
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com');

-- Switch to an admin session. Requires a real profiles row with
-- role='admin' for '<admin-uuid>' to already exist in the target
-- project (see docs/ai/PROJECT_STATE.md's standing "admin provisioning"
-- open item -- nothing in this schema creates one automatically).
set local role authenticated;
set local request.jwt.claims = '{"sub": "<admin-uuid>", "role": "authenticated"}';

update public.listing_partners
set status = 'approved', approved_by = '<admin-uuid>', approved_at = now()
where id = '<partner-a-uuid>';
-- Expect: UPDATE 1, succeeds -- admin bypasses the trigger's block via
-- listing_partners_update_admin's row match, and the trigger itself
-- checks the CALLER's (admin's) own profiles.role, which is 'admin'.

rollback;

-- ============================================================
-- Scenario 6-9: property_listings visibility and write gating
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com');

-- Scenario 6: a still-pending partner tries to create a listing.
insert into public.property_listings (partner_id, title, listing_type)
values ('<partner-a-uuid>', 'Test Listing', 'for_sale');
-- Expect: INSERT rejected (RLS with_check violation) -- partner is not
-- yet 'approved'.

rollback;

begin;

-- Re-seed: Partner A, pre-approved directly (simulating a prior admin
-- action, since this block tests property_listings behavior, not the
-- approval flow itself).
set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email, status)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com', 'approved');
-- (In a real run this INSERT itself would be blocked by
-- listing_partners_insert_own's with_check -- this seed step assumes
-- direct/service-role seeding for test setup purposes only, same
-- caveat as this whole file's "not executed" status.)

insert into public.property_listings (id, partner_id, title, listing_type, status)
values ('00000000-0000-4000-8000-00000000b001', '<partner-a-uuid>', 'Active Listing', 'for_sale', 'active');
insert into public.property_listings (id, partner_id, title, listing_type, status)
values ('00000000-0000-4000-8000-00000000b002', '<partner-a-uuid>', 'Draft Listing', 'for_sale', 'draft');

-- Scenario 7: an anonymous session reads property_listings.
set local role anon;
select id, title from public.property_listings;
-- Expect: exactly 1 row (the 'active' one, id ...b001) -- the 'draft'
-- listing (...b002) must never appear to anon, regardless of
-- listing_type/other fields.

rollback;

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email, status)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com', 'approved');
insert into public.property_listings (id, partner_id, title, listing_type, status)
values ('00000000-0000-4000-8000-00000000b001', '<partner-a-uuid>', 'Active Listing', 'for_sale', 'active');

-- Scenario 8: suspend the partner, then re-check anon visibility of
-- their previously-active listing (still within the same transaction --
-- simulating the admin-suspend + immediate public-read sequence).
set local role authenticated;
set local request.jwt.claims = '{"sub": "<admin-uuid>", "role": "authenticated"}';
update public.listing_partners set status = 'suspended' where id = '<partner-a-uuid>';

set local role anon;
select id from public.property_listings where id = '00000000-0000-4000-8000-00000000b001';
-- Expect: 0 rows -- a suspended partner's listings must lose public
-- visibility immediately, without needing their own status touched.

rollback;

begin;

-- Scenario 9: Partner B (different, never approved) tries to modify
-- Partner A's listing directly by id.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-a-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email, status)
values ('<partner-a-uuid>', 'Test Partner A', '+60123456789', 'a@example.com', 'approved');
insert into public.property_listings (id, partner_id, title, listing_type, status)
values ('00000000-0000-4000-8000-00000000b001', '<partner-a-uuid>', 'Active Listing', 'for_sale', 'active');

set local role authenticated;
set local request.jwt.claims = '{"sub": "<partner-b-uuid>", "role": "authenticated"}';
insert into public.listing_partners (id, display_name, phone, email, status)
values ('<partner-b-uuid>', 'Test Partner B', '+60129999999', 'b@example.com', 'approved');

update public.property_listings
set title = 'Hijacked'
where id = '00000000-0000-4000-8000-00000000b001';
-- Expect: UPDATE 0 -- Partner B is approved, but does not own this
-- listing (partner_id mismatch), so no policy's USING clause matches.

rollback;
