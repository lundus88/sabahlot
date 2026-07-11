-- Sprint 01B-1: activity_logs
--
-- No client-writable path exists for this table. RLS is enabled with
-- ZERO policies granted to `anon` or `authenticated` for any of
-- SELECT/INSERT/UPDATE/DELETE -- meaning every operation is denied by
-- default for ordinary client sessions. The only way a row is ever
-- written is via the SECURITY DEFINER log_activity() function,
-- called internally by triggers on other tables (land_records is
-- wired up below as the first example). This satisfies "pengguna
-- biasa tidak boleh mengubah log lama / memadam log / mencipta log
-- palsu tanpa kawalan" by construction: there is no grant that would
-- let them do any of those things, and log_activity() always derives
-- the actor from auth.uid() itself rather than trusting a
-- client-supplied value.
--
-- OWNER DECISION REQUIRED: no SELECT policy exists for owners to view
-- logs about their own entities in this sprint (e.g. "show me the
-- history of my own land_record"). Scoping that correctly requires a
-- per-entity_type ownership lookup (there is no single FK this table
-- can join on, since entity_type/entity_id is polymorphic by design).
-- Until that is decided, the strictest safe default -- no read access
-- at all outside a future admin/service-role path -- is applied.

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action public.activity_action not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table public.activity_logs is
  'Sprint 01B-1: audit trail. RLS enabled, zero policies for anon/authenticated -- writable only via log_activity() (SECURITY DEFINER) called from triggers. No client-facing read policy exists yet; see ADMIN POLICY PENDING OWNER APPROVAL and the OWNER DECISION REQUIRED note above.';

create index if not exists activity_logs_entity_idx
  on public.activity_logs (entity_type, entity_id, created_at desc);
create index if not exists activity_logs_actor_id_idx
  on public.activity_logs (actor_id, created_at desc);

alter table public.activity_logs enable row level security;

-- No policies are created here on purpose. RLS being enabled with no
-- matching policy means every role except the table owner / a
-- SECURITY DEFINER function is denied every operation. This is the
-- entire enforcement mechanism for this table -- there is nothing
-- else to configure.

-- Writer function. SECURITY DEFINER is required so it can insert
-- despite activity_logs having no client-facing policies; search_path
-- is pinned to `public`. The actor is always taken from auth.uid()
-- internally -- callers cannot forge a different actor_id, because
-- the function does not accept one as a parameter.
create or replace function public.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_action public.activity_action,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, metadata)
  values ((select auth.uid()), p_entity_type, p_entity_id, p_action, p_metadata);
end;
$$;

comment on function public.log_activity(text, uuid, public.activity_action, jsonb) is
  'Sprint 01B-1: the only writer of activity_logs. SECURITY DEFINER, search_path pinned. EXECUTE is revoked from anon/authenticated/public below so it cannot be called directly (e.g. via PostgREST RPC) -- it may only be invoked from within another SECURITY DEFINER trigger function, such as log_land_record_activity() below.';

-- Close the direct-call path. Without this, Postgres grants EXECUTE
-- on new functions to PUBLIC by default, which would expose
-- log_activity as a directly callable RPC endpoint through
-- PostgREST/Supabase -- letting any authenticated (or anonymous)
-- caller write arbitrary log rows about arbitrary entities. Revoking
-- EXECUTE does not break the trigger below: trigger invocation is not
-- subject to EXECUTE-privilege checks, and log_land_record_activity()
-- is itself SECURITY DEFINER, so its internal call to log_activity()
-- runs under the definer's privileges, not the original caller's.
revoke execute on function public.log_activity(text, uuid, public.activity_action, jsonb) from public;
revoke execute on function public.log_activity(text, uuid, public.activity_action, jsonb) from anon;
revoke execute on function public.log_activity(text, uuid, public.activity_action, jsonb) from authenticated;

-- First (and, for this sprint, only) wiring of the logging system:
-- land_records. Extending the same pattern to other tables is
-- straightforward future work and is not required for this sprint's
-- scope.
create or replace function public.log_land_record_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('land_record', new.id, 'create', null);
    return new;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.log_activity(
        'land_record',
        new.id,
        'status_change',
        jsonb_build_object('from_status', old.status, 'to_status', new.status)
      );
    else
      perform public.log_activity('land_record', new.id, 'update', null);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    perform public.log_activity('land_record', old.id, 'delete', null);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists land_records_log_activity on public.land_records;
create trigger land_records_log_activity
  after insert or update or delete on public.land_records
  for each row
  execute function public.log_land_record_activity();
