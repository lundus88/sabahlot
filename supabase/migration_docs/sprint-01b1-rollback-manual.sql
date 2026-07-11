-- ============================================================
-- DO NOT RUN AUTOMATICALLY
-- ============================================================
-- This is a MANUAL rollback reference for Sprint 01B-1 only. It is
-- documentation, not a migration -- it deliberately does NOT live in
-- supabase/migrations/ so Supabase's migration runner never picks it
-- up automatically.
--
-- It has not been run against any Supabase project. Running it
-- requires a human to explicitly execute it, table-by-table, against
-- a specific target project, after confirming that project is the
-- intended one (Dev, never Beta/Prod without a separate, explicit
-- decision).
--
-- Scope: this script only ever touches the 9 tables + supporting
-- enums/functions created by
-- supabase/migrations/202607110001 .. 202607110011. It never
-- references, and cannot affect, `public.lots` or anything under
-- supabase/dev_migrations/.
--
-- Dependency order: DROP statements run in exact reverse of the
-- CREATE order, so every DROP happens before anything it depends on
-- is removed (e.g. the land_records trigger that calls
-- log_land_record_activity() is dropped before log_land_record_activity()
-- itself; log_activity() is dropped before activity_logs; every table
-- is dropped before the enum types its own columns use, since a type
-- cannot be dropped while a column still references it).
-- ============================================================

-- ---- 11. activity_logs (+ its functions and the land_records trigger) ----
drop trigger if exists land_records_log_activity on public.land_records;
drop function if exists public.log_land_record_activity();
drop function if exists public.log_activity(text, uuid, public.activity_action, jsonb);
drop table if exists public.activity_logs;

-- ---- 10. service_requests ----
drop trigger if exists service_requests_set_updated_at on public.service_requests;
drop table if exists public.service_requests;

-- ---- 9. feedback ----
drop table if exists public.feedback;

-- ---- 8. documents ----
drop table if exists public.documents;

-- ---- 7. land_parties ----
drop trigger if exists land_parties_set_updated_at on public.land_parties;
drop table if exists public.land_parties;

-- ---- 6. land_points ----
drop table if exists public.land_points;

-- ---- 5. land_record_geometries ----
drop trigger if exists land_record_geometries_set_updated_at on public.land_record_geometries;
drop table if exists public.land_record_geometries;

-- ---- 4. land_records ----
-- land_records_prevent_privileged_status + its function were added by
-- the Sprint 01B-3 security fix (self-approval prevention).
drop trigger if exists land_records_set_updated_at on public.land_records;
drop trigger if exists land_records_prevent_privileged_status on public.land_records;
drop function if exists public.prevent_land_record_privileged_status();
drop table if exists public.land_records;

-- ---- 3. profiles (+ its functions and the auth.users trigger) ----
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop trigger if exists profiles_prevent_role_escalation on public.profiles;
drop function if exists public.prevent_profile_role_escalation();
drop trigger if exists profiles_set_updated_at on public.profiles;
drop table if exists public.profiles;

-- ---- 2. enums ----
-- Each type is dropped only after every table whose columns used it
-- is already gone (all table drops above are already ordered before
-- this point).
drop type if exists public.activity_action;
drop type if exists public.service_request_status;
drop type if exists public.service_request_type;
drop type if exists public.feedback_issue_type;
drop type if exists public.document_type;
drop type if exists public.party_role;
drop type if exists public.point_type;
drop type if exists public.line_style;
drop type if exists public.geometry_category;
drop type if exists public.geometry_type;
drop type if exists public.land_record_status;
drop type if exists public.heir_location_knowledge;
drop type if exists public.applicant_status;
drop type if exists public.land_issue_tag;
drop type if exists public.land_available_record;
drop type if exists public.application_age;
drop type if exists public.land_case_type;
drop type if exists public.region_id;
drop type if exists public.user_role;

-- ---- 1. helper function ----
-- Only safe to drop once every trigger that referenced it (on
-- profiles, land_records, land_record_geometries, land_parties,
-- service_requests -- all dropped above) is gone.
drop function if exists public.set_updated_at();

-- ============================================================
-- End of manual rollback reference. public.lots and
-- supabase/dev_migrations/* are untouched by every statement above.
-- ============================================================
