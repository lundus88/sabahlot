-- Sprint 01B-1: feedback
--
-- First real persistence for src/lib/feedback/feedbackStorage.ts
-- FeedbackEntry, which today is localStorage-only. Column names
-- follow the existing client shape (nama/telefon/etc. renamed to
-- English equivalents; module_tested vs module both carried over
-- as-is even though they overlap in the client model today -- see
-- migration plan for that note).
--
-- Anonymous submission is allowed (matches current app behavior,
-- which never requires auth to submit feedback), but anonymous
-- submissions become unreadable by anyone once written, since there
-- is no owner to match against and no admin-read policy exists yet
-- in this sprint. This is intentional, safe-by-default behavior, not
-- a bug.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,

  submitted_name text,
  phone text,
  test_location text,
  phone_type text,
  browser text,
  module_tested text,
  issue_type public.feedback_issue_type not null,
  description text,
  suggestion text,
  screenshot_note text,
  region public.region_id,
  state text,
  district text,
  module text,

  created_at timestamptz not null default now()
);

comment on table public.feedback is
  'Sprint 01B-1: first cloud persistence for feedback (previously localStorage-only). user_id nullable: anonymous submission matches current app behavior. No UPDATE/DELETE policy -- feedback is immutable once submitted; see OWNER DECISION REQUIRED for whether users should be able to withdraw their own feedback.';

create index if not exists feedback_user_id_idx
  on public.feedback (user_id);
create index if not exists feedback_created_at_idx
  on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- SELECT: a signed-in user can only see feedback tied to their own
-- user_id. Anonymous submissions (user_id is null) are not
-- selectable by anyone under this policy set -- there is no
-- "everyone can read all feedback" policy anywhere in this file.
drop policy if exists "feedback_select_own" on public.feedback;
create policy "feedback_select_own"
  on public.feedback
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- INSERT: anonymous callers may submit feedback but only with
-- user_id left null (they have no auth.uid() to assert). Signed-in
-- callers may submit as themselves or anonymously; they can never set
-- user_id to someone else's id.
drop policy if exists "feedback_insert_anon" on public.feedback;
create policy "feedback_insert_anon"
  on public.feedback
  for insert
  to anon
  with check (user_id is null);

drop policy if exists "feedback_insert_authenticated" on public.feedback;
create policy "feedback_insert_authenticated"
  on public.feedback
  for insert
  to authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- UPDATE / DELETE: intentionally no policy for any role. Feedback is
-- treated as an immutable, append-only submission in this sprint.
-- Any future "edit/withdraw my feedback" capability, or an
-- admin-moderation capability, is an explicit product decision not
-- made here (see ADMIN POLICY PENDING OWNER APPROVAL).
