-- Sprint 01B-1: service_requests
--
-- No existing client-side data model to migrate from -- today
-- ServiceRequestScreen is a UI stub that redirects into the feedback
-- flow. This table is designed from the existing UI's stated intent
-- ("request assistance from a land officer or surveyor",
-- NCR "Request Review Assistance") rather than from any shipped
-- local data shape.

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references auth.users (id) on delete set null,
  land_record_id uuid references public.land_records (id) on delete set null,

  request_type public.service_request_type not null,
  status public.service_request_status not null default 'new',
  assigned_to uuid references auth.users (id) on delete set null,

  contact_phone text,
  contact_email text,
  message text,
  region public.region_id,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_requests is
  'Sprint 01B-1: support/assistance requests. No UPDATE/DELETE policy for requesters in this sprint -- immutable once submitted, matching feedback. status/assigned_to changes are reserved for a future staff/admin-only path (ADMIN POLICY PENDING OWNER APPROVAL).';
comment on column public.service_requests.land_record_id is
  'ON DELETE SET NULL: a service request is its own standalone support-ticket-like record and must not disappear if the referenced land_record is later deleted.';

create index if not exists service_requests_requester_id_idx
  on public.service_requests (requester_id);
create index if not exists service_requests_status_idx
  on public.service_requests (status);
create index if not exists service_requests_land_record_id_idx
  on public.service_requests (land_record_id);

alter table public.service_requests enable row level security;

drop policy if exists "service_requests_select_own" on public.service_requests;
create policy "service_requests_select_own"
  on public.service_requests
  for select
  to authenticated
  using ((select auth.uid()) = requester_id);

drop policy if exists "service_requests_insert_anon" on public.service_requests;
create policy "service_requests_insert_anon"
  on public.service_requests
  for insert
  to anon
  with check (requester_id is null);

drop policy if exists "service_requests_insert_authenticated" on public.service_requests;
create policy "service_requests_insert_authenticated"
  on public.service_requests
  for insert
  to authenticated
  with check (requester_id is null or requester_id = (select auth.uid()));

-- UPDATE / DELETE: intentionally no policy for any role in this
-- sprint. Editing one's own request message, withdrawing a request,
-- and staff-side status/assignment changes are all explicit product
-- decisions not made here -- see OWNER DECISION REQUIRED. The
-- strictest safe default (no self-service mutation at all) is
-- applied until those decisions are made.
--
-- The updated_at trigger is attached now (harmless with no UPDATE
-- policy in place) so that whenever an UPDATE path is approved and
-- added later, updated_at maintenance does not require another
-- migration.
drop trigger if exists service_requests_set_updated_at on public.service_requests;
create trigger service_requests_set_updated_at
  before update on public.service_requests
  for each row
  execute function public.set_updated_at();
