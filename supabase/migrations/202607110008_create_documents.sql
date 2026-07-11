-- Sprint 01B-1: documents (METADATA ONLY)
--
-- This migration creates the document metadata table and its RLS
-- only. Per Sprint 01B-1 scope, it explicitly does NOT:
--   - create a Supabase Storage bucket
--   - create any storage.objects policy
--   - upload any file
-- Bucket creation and storage.objects policies are a separate,
-- later sprint, to be authored only after this metadata design is
-- reviewed and approved.
--
-- No permanent public URL is stored anywhere on this table --
-- storage_bucket + storage_path only, resolved to a short-lived
-- signed URL by the application at read time (future sprint).

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  land_record_id uuid references public.land_records (id) on delete cascade,
  uploaded_by uuid references auth.users (id) on delete set null,

  document_type public.document_type not null,
  storage_bucket text not null,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  size_bytes bigint,
  is_sensitive boolean not null default true,

  created_at timestamptz not null default now()
);

comment on table public.documents is
  'Sprint 01B-1: document METADATA only. No Storage bucket exists yet; storage_bucket/storage_path point at a location that will be created in a later, separate sprint. No permanent public URL is ever stored.';
comment on column public.documents.land_record_id is
  'Nullable: mirrors land_points -- ON DELETE CASCADE means deleting a land_record removes metadata for documents tied only to it. See OWNER DECISION REQUIRED in the migration plan re: whether sensitive documents should instead survive record deletion via uploaded_by ownership (ON DELETE SET NULL), the way land_points does.';

create unique index if not exists documents_storage_bucket_path_key
  on public.documents (storage_bucket, storage_path);
create index if not exists documents_land_record_id_idx
  on public.documents (land_record_id);
create index if not exists documents_uploaded_by_idx
  on public.documents (uploaded_by);

alter table public.documents enable row level security;

-- Two-branch ownership, same pattern as land_points: a document
-- linked to a land_record is owned via that record's owner; an
-- unlinked document is owned by whoever uploaded it.
drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own"
  on public.documents
  for select
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = documents.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and uploaded_by = (select auth.uid())
    )
  );

drop policy if exists "documents_insert_own" on public.documents;
create policy "documents_insert_own"
  on public.documents
  for insert
  to authenticated
  with check (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = documents.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and uploaded_by = (select auth.uid())
    )
  );

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own"
  on public.documents
  for update
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = documents.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and uploaded_by = (select auth.uid())
    )
  )
  with check (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = documents.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and uploaded_by = (select auth.uid())
    )
  );

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own"
  on public.documents
  for delete
  to authenticated
  using (
    (
      land_record_id is not null
      and exists (
        select 1
        from public.land_records lr
        where lr.id = documents.land_record_id
          and lr.owner_id = (select auth.uid())
      )
    )
    or (
      land_record_id is null
      and uploaded_by = (select auth.uid())
    )
  );
