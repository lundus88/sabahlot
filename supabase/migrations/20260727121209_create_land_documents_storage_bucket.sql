-- Sprint: Documents/Storage (ADR-012) — bucket + storage.objects RLS
-- Scope: v1 create-only, matches ADR-013 pattern (delete/update deferred
-- for all cloud-write modules). Bucket is private; no public URLs.
-- Path convention: {owner_id}/{land_record_id}/{document_id}-{filename}
-- Ownership is derived from the first path segment matching auth.uid(),
-- mirroring the owner-only RLS pattern already used on public.documents.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'land-documents',
  'land-documents',
  false,
  10485760, -- 10MB
  array['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
on conflict (id) do nothing;

drop policy if exists "land_documents_select_own" on storage.objects;
create policy "land_documents_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'land-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "land_documents_insert_own" on storage.objects;
create policy "land_documents_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'land-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- No update/delete policy yet, deliberately: v1 is create-only,
-- mirroring ADR-013 (delete deferred for geometry/points/parties).
-- Revisit only via an explicit future sprint.
