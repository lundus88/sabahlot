-- sprint-feedback-cloud-sync
--
-- Adds an admin-broad-read policy to public.feedback, mirroring
-- listing_partners_select_admin / profiles_select_admin exactly. Without
-- this, feedback submitted anonymously (user_id is null) is permanently
-- unreadable by anyone -- see the OWNER DECISION REQUIRED note in
-- 202607110009_create_feedback.sql. This is a second, independent
-- permissive SELECT policy alongside feedback_select_own; Postgres
-- combines multiple permissive policies with OR, so this only ever adds
-- visibility and cannot narrow what feedback_select_own already allows a
-- caller to see of their own submissions. No UPDATE/DELETE policy is
-- added -- feedback stays immutable, per owner decision 2026-08-18.

create policy "feedback_select_admin"
  on public.feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid())
        and p.role = 'admin'
    )
  );
