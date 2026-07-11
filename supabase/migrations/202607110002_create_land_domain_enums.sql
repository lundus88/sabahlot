-- Sprint 01B-1: enums for the land-record domain.
--
-- Every enum below mirrors a TypeScript union type that is already
-- shipped and in production client-side use (see mapping table in
-- supabase/migration_docs/sprint-01b1-migration-plan.md). None of
-- these are speculative additions; each satisfies the "benar-benar
-- stabil" (genuinely stable) bar for using an enum/check constraint.
--
-- Postgres has no `CREATE TYPE IF NOT EXISTS`, so each enum is guarded
-- by a DO block checking pg_type, matching the idempotent style already
-- used in supabase/migrations/202606140002_upgrade_lots_polygon_geojson.sql
-- and 202606140003_repair_lots_schema.sql.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum (
      'public_user',
      'surveyor',
      'land_officer',
      'admin'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'region_id') then
    create type public.region_id as enum (
      'sabah',
      'sarawak',
      'peninsular'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'land_case_type') then
    create type public.land_case_type as enum (
      'land_application',
      'inheritance_land',
      'family_customary_land',
      'titled_land',
      'unsure'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'application_age') then
    create type public.application_age as enum (
      'under_5_years',
      '5_to_10_years',
      '10_to_20_years',
      'over_20_years',
      'unsure'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'land_available_record') then
    create type public.land_available_record as enum (
      'title',
      'official_receipt',
      'application_letter',
      'plan_or_sketch',
      'gps_coordinates',
      'site_photos',
      'no_record'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'land_issue_tag') then
    create type public.land_issue_tag as enum (
      'unknown_application_status',
      'difficult_to_get_information',
      'lost_documents',
      'unknown_land_location',
      'unclear_land_process',
      'boundary_dispute',
      'title_subdivision',
      'customary_land_ncr',
      'encroachment',
      'overlapping_land'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'applicant_status') then
    create type public.applicant_status as enum (
      'alive',
      'deceased',
      'unknown'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'heir_location_knowledge') then
    create type public.heir_location_knowledge as enum (
      'yes',
      'no',
      'not_sure'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'land_record_status') then
    create type public.land_record_status as enum (
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'archived'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'geometry_type') then
    create type public.geometry_type as enum (
      'polygon',
      'line'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'geometry_category') then
    create type public.geometry_category as enum (
      'parent_lot',
      'proposed_lot',
      'standard_line',
      'proposed_boundary',
      'proposed_access',
      'road_reserve',
      'setback',
      'reference_line'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'line_style') then
    create type public.line_style as enum (
      'solid',
      'dashed',
      'dotted'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'point_type') then
    create type public.point_type as enum (
      'boundary_mark',
      'control_point',
      'found_point',
      'track_point',
      'target_point'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'party_role') then
    create type public.party_role as enum (
      'owner',
      'original_applicant',
      'main_heir',
      'surveyor',
      'witness',
      'village_head'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'document_type') then
    create type public.document_type as enum (
      'title_deed',
      'official_receipt',
      'application_letter',
      'plan_or_sketch',
      'site_photo',
      'pdf_plan_export',
      'kml_export',
      'dxf_export',
      'other'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feedback_issue_type') then
    create type public.feedback_issue_type as enum (
      'Critical',
      'Major',
      'Minor',
      'Suggestion'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_request_type') then
    create type public.service_request_type as enum (
      'land_officer_assistance',
      'surveyor_referral',
      'general_inquiry',
      'ncr_review'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'service_request_status') then
    create type public.service_request_status as enum (
      'new',
      'assigned',
      'in_progress',
      'resolved',
      'closed'
    );
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'activity_action') then
    create type public.activity_action as enum (
      'create',
      'update',
      'delete',
      'status_change',
      'document_upload',
      'document_delete'
    );
  end if;
end
$$;
