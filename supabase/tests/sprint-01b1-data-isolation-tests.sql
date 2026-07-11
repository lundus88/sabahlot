-- Sprint 01B-1: data isolation test plan.
--
-- STATUS: NOT EXECUTED. This file is prepared for review only. It has
-- not been run against any Supabase project (Dev, Beta, or Prod) as
-- part of this sprint. Do not run it here either -- it is intended to
-- be executed against a disposable Dev database in a later,
-- explicitly approved step, after the migrations in this same
-- directory tree have been reviewed and applied to that Dev database.
--
-- How this is meant to be run (later, not now):
--   Each block below is wrapped in `begin ... rollback;` so it never
--   leaves committed data behind, and uses `set local role` +
--   `set local request.jwt.claims` to simulate a given
--   authenticated user's session for RLS purposes, the standard way
--   to exercise Postgres RLS policies from psql/SQL directly without
--   going through the Supabase client SDK. Replace
--   '<user-a-uuid>' / '<user-b-uuid>' with real auth.users ids from
--   the target Dev project before running.
--
-- Every SELECT in this file is expected to return the row count noted
-- in its comment; every write (INSERT/UPDATE/DELETE) attempted by the
-- "wrong" user is expected to either affect 0 rows or raise a
-- permission-denied-shaped RLS failure, never succeed.

-- ============================================================
-- Scenario 1-6: land_records core ownership
-- ============================================================

begin;

-- Simulate User A creating a land_record.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

-- Scenario 1: User A creates a land record.
insert into public.land_records (owner_id, record_name)
values ('<user-a-uuid>', 'Test Record A')
returning id;
-- Expect: 1 row inserted. Capture the returned id as <record-a-id>
-- for use in the remaining scenarios in this block.

-- Scenario 2: User A reads her own land record.
select id, record_name from public.land_records where owner_id = '<user-a-uuid>';
-- Expect: 1 row (the record just created).

rollback;

begin;

-- Re-seed for scenarios 3-6 (each begin/rollback block starts clean;
-- in a real run you would either seed once in a setup transaction
-- that commits to Dev, or chain these scenarios inside one block --
-- shown here as separate labelled steps for readability).
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';
insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a001', '<user-a-uuid>', 'Test Record A');

-- Switch session to User B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-b-uuid>", "role": "authenticated"}';

-- Scenario 3: User B tries to read User A's land record.
select id from public.land_records where id = '00000000-0000-4000-8000-00000000a001';
-- Expect: 0 rows (RLS filters it out silently, not a visible error).

-- Scenario 4: User B tries to update User A's land record.
update public.land_records
set record_name = 'Hijacked'
where id = '00000000-0000-4000-8000-00000000a001';
-- Expect: UPDATE 0 (no rows matched the USING clause for this role).

-- Scenario 5: User B tries to delete User A's land record.
delete from public.land_records
where id = '00000000-0000-4000-8000-00000000a001';
-- Expect: DELETE 0.

rollback;

begin;

-- Scenario 6: an anonymous (unauthenticated) session tries to read
-- land records at all.
set local role anon;
select id from public.land_records limit 1;
-- Expect: 0 rows -- no policy grants `anon` any SELECT on
-- land_records.

rollback;

-- ============================================================
-- Scenario 7-8: land geometry / points isolation
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a002', '<user-a-uuid>', 'Test Record A2');

-- Scenario 7: User A manages her own geometry.
insert into public.land_record_geometries (
  land_record_id, geometry_type, category, coordinates
)
values (
  '00000000-0000-4000-8000-00000000a002',
  'polygon',
  'parent_lot',
  '[{"lat": 5.98, "lng": 116.07}, {"lat": 5.99, "lng": 116.08}, {"lat": 5.97, "lng": 116.09}]'::jsonb
)
returning id;
-- Expect: 1 row inserted successfully -- User A can fully manage
-- geometry on her own land_record.

insert into public.land_points (land_record_id, captured_by, point_type, latitude, longitude)
values ('00000000-0000-4000-8000-00000000a002', '<user-a-uuid>', 'boundary_mark', 5.98, 116.07)
returning id;
-- Expect: 1 row inserted.

-- Switch to User B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-b-uuid>", "role": "authenticated"}';

-- Scenario 8: User B tries to read User A's points.
select id from public.land_points where land_record_id = '00000000-0000-4000-8000-00000000a002';
-- Expect: 0 rows.

rollback;

-- ============================================================
-- Scenario 9-10: document metadata isolation
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a003', '<user-a-uuid>', 'Test Record A3');

insert into public.documents (
  land_record_id, uploaded_by, document_type, storage_bucket, storage_path, original_filename
)
values (
  '00000000-0000-4000-8000-00000000a003',
  '<user-a-uuid>',
  'title_deed',
  'land-documents',
  '00000000-0000-4000-8000-00000000a003/placeholder.pdf',
  'placeholder.pdf'
)
returning id;

-- Scenario 9: User A reads her own document metadata.
select id, original_filename from public.documents
where land_record_id = '00000000-0000-4000-8000-00000000a003';
-- Expect: 1 row.

-- Switch to User B.
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-b-uuid>", "role": "authenticated"}';

-- Scenario 10: User B tries to read User A's document metadata.
select id from public.documents where land_record_id = '00000000-0000-4000-8000-00000000a003';
-- Expect: 0 rows.

rollback;

-- ============================================================
-- Scenario 11: feedback isolation
-- ============================================================

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.feedback (user_id, issue_type, description)
values ('<user-a-uuid>', 'Minor', 'Test feedback from User A');

-- Switch to User B (an ordinary authenticated user, not admin).
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-b-uuid>", "role": "authenticated"}';

-- Scenario 11: User B tries to read all feedback, including User A's.
select id from public.feedback;
-- Expect: 0 rows -- feedback_select_own only matches rows where
-- user_id = the caller's own uid; there is no
-- "authenticated can read all feedback" policy anywhere in this
-- migration set.

rollback;

-- ============================================================
-- Additional check: anonymous write-then-read on feedback, to
-- confirm write access does not imply read access.
-- ============================================================

begin;

set local role anon;
insert into public.feedback (user_id, issue_type, description)
values (null, 'Suggestion', 'Anonymous test feedback');
-- Expect: 1 row inserted (feedback_insert_anon allows this).

select id from public.feedback;
-- Expect: 0 rows -- anon has no SELECT policy on feedback at all,
-- even for the row it just inserted in the same transaction.

rollback;

-- ============================================================
-- Sprint 01B-3: privilege escalation regression tests.
--
-- STATUS: NOT EXECUTED, same as the rest of this file. These
-- scenarios specifically target the CRITICAL (profiles.role) and
-- HIGH (land_records.status) findings from the Sprint 01B-2 review
-- and the fixes applied in Sprint 01B-3. Every "ditolak"/"denied"
-- scenario below is expected to fail BOTH the RLS policy check and,
-- for role/status specifically, the corresponding trigger -- run
-- them individually against Dev later to confirm which layer caught
-- it (removing one layer at a time is a good way to prove both are
-- independently effective, not just one masking a gap in the other).
-- ============================================================

-- ---- Profiles: scenario 1 -- INSERT own profile, default role ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.profiles (id)
values ('<user-a-uuid>');
-- Expect: 1 row inserted. role defaults to 'public_user'; both
-- profiles_insert_own's WITH CHECK and the
-- prevent_profile_role_escalation trigger's INSERT branch allow this
-- (new.role = 'public_user' in both).

rollback;

-- ---- Profiles: scenario 2 -- INSERT own profile with role='admin' ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.profiles (id, role)
values ('<user-a-uuid>', 'admin');
-- Expect: REJECTED. profiles_insert_own's WITH CHECK requires
-- `role = 'public_user'` -- this fails RLS before the trigger even
-- gets a chance to also reject it.

rollback;

-- ---- Profiles: scenario 3 -- INSERT a profile for someone else ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.profiles (id)
values ('<user-b-uuid>');
-- Expect: REJECTED. profiles_insert_own's WITH CHECK requires
-- `auth.uid() = id`; User A's uid does not match User B's id.

rollback;

-- ---- Profiles: scenario 4 -- UPDATE own role to admin ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.profiles (id)
values ('<user-a-uuid>');

update public.profiles
set role = 'admin'
where id = '<user-a-uuid>';
-- Expect: REJECTED (statement error, not a silent 0-row update).
-- profiles_update_own's USING/WITH CHECK would otherwise allow this
-- update (it is the user's own row); the
-- prevent_profile_role_escalation trigger's UPDATE branch is what
-- actually raises the exception here, since RLS alone cannot compare
-- NEW.role against OLD.role.

rollback;

-- ---- Profiles: scenario 5 -- UPDATE own profile without touching role ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.profiles (id)
values ('<user-a-uuid>');

update public.profiles
set full_name = 'Test User A'
where id = '<user-a-uuid>';
-- Expect: 1 row updated successfully. role is left unchanged
-- (implicitly still 'public_user'), so the escalation trigger's
-- `new.role is distinct from old.role` check is false and the update
-- proceeds normally.

rollback;

-- ---- Profiles: scenario 6 -- anonymous INSERT profile ----
begin;

set local role anon;

insert into public.profiles (id)
values ('<user-a-uuid>');
-- Expect: REJECTED. profiles_insert_own is scoped `to authenticated`
-- only; there is no INSERT policy at all for the `anon` role on
-- profiles.

rollback;

-- ---- Land records: scenario 7 -- INSERT with default status ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (owner_id, record_name)
values ('<user-a-uuid>', 'Test Record A7')
returning id, status;
-- Expect: 1 row inserted, status = 'draft' (column default). Passes
-- both land_records_insert_own's `status in ('draft','submitted')`
-- check and the prevent_land_record_privileged_status trigger's
-- INSERT branch.

rollback;

-- ---- Land records: scenario 8 -- INSERT directly with status='approved' ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (owner_id, record_name, status)
values ('<user-a-uuid>', 'Test Record A8', 'approved');
-- Expect: REJECTED. land_records_insert_own's WITH CHECK requires
-- `status in ('draft','submitted')` -- fails RLS before the trigger
-- is even reached.

rollback;

-- ---- Land records: scenario 9 -- UPDATE an ordinary field on own record ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a009', '<user-a-uuid>', 'Test Record A9');

update public.land_records
set land_history_notes = 'Updated notes'
where id = '00000000-0000-4000-8000-00000000a009';
-- Expect: 1 row updated successfully. status is not being changed
-- (stays 'draft'), so neither land_records_update_own's WITH CHECK
-- (ownership only) nor the trigger (status unchanged) blocks this.

rollback;

-- ---- Land records: scenario 10 -- UPDATE own record's status to approved ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a010', '<user-a-uuid>', 'Test Record A10');

update public.land_records
set status = 'approved'
where id = '00000000-0000-4000-8000-00000000a010';
-- Expect: REJECTED (statement error). land_records_update_own's WITH
-- CHECK only checks ownership (deliberately, so unrelated field
-- edits on already-progressed records are not blanket-blocked -- see
-- the comment in the migration file); the
-- prevent_land_record_privileged_status trigger's `new.status is
-- distinct from old.status and new.status not in (...)` check is
-- what actually raises the exception here.

rollback;

-- ---- Land records: scenario 11 -- User B tries to change User A's status ----
begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';

insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a011', '<user-a-uuid>', 'Test Record A11');

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-b-uuid>", "role": "authenticated"}';

update public.land_records
set status = 'approved'
where id = '00000000-0000-4000-8000-00000000a011';
-- Expect: UPDATE 0 rows. land_records_update_own's USING clause
-- (`auth.uid() = owner_id`) filters this row out for User B entirely
-- before the trigger or WITH CHECK are even relevant -- User B never
-- sees this row as a target in the first place.

rollback;

-- ---- Land records: scenario 12 -- anonymous INSERT/UPDATE ----
begin;

set local role anon;

insert into public.land_records (owner_id, record_name)
values ('<user-a-uuid>', 'Anon attempt');
-- Expect: REJECTED. land_records_insert_own is scoped
-- `to authenticated` only; no policy exists for `anon` on
-- land_records.

rollback;

begin;

set local role authenticated;
set local request.jwt.claims = '{"sub": "<user-a-uuid>", "role": "authenticated"}';
insert into public.land_records (id, owner_id, record_name)
values ('00000000-0000-4000-8000-00000000a012', '<user-a-uuid>', 'Test Record A12');

set local role anon;

update public.land_records
set status = 'approved'
where id = '00000000-0000-4000-8000-00000000a012';
-- Expect: UPDATE 0 rows. No UPDATE policy exists for `anon` on
-- land_records at all.

rollback;
