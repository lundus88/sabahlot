# Sprint 01B-1 — Migration Plan

Status: **authoring only**. Nothing in `supabase/migrations/202607110001` through `202607110011` has been executed against any Supabase project (Dev, Beta, or Prod). No `supabase db push`, no SQL Editor, no project link was used to produce these files.

## Dependency order

Files are numbered so that applying them in filename order (the default behavior of Supabase's migration runner) satisfies every foreign key and function dependency:

| # | File | Depends on |
|---|---|---|
| 1 | `create_helper_set_updated_at` | nothing |
| 2 | `create_land_domain_enums` | nothing |
| 3 | `create_profiles` | `auth.users` (pre-existing), enums from #2 |
| 4 | `create_land_records` | `auth.users`, enums from #2 |
| 5 | `create_land_record_geometries` | `land_records` (#4), enums |
| 6 | `create_land_points` | `land_records` (#4, nullable FK), `auth.users` |
| 7 | `create_land_parties` | `land_records` (#4) |
| 8 | `create_documents` | `land_records` (#4, nullable FK), `auth.users` |
| 9 | `create_feedback` | `auth.users` (nullable FK), enums |
| 10 | `create_service_requests` | `auth.users`, `land_records` (both nullable FK) |
| 11 | `create_activity_logs` | `auth.users` (nullable FK), attaches a trigger to `land_records` (#4) |

None of these files reference, alter, or depend on `public.lots` or `supabase/dev_migrations/*` in any way.

## Client-model-to-schema mapping (why each enum/table exists)

Every enum and every table maps to a TypeScript type already shipped in the client, confirmed by direct source inspection during Sprint 01A and re-verified while authoring:

| Server object | Client source |
|---|---|
| `land_case_type`, `application_age`, `land_available_record`, `land_issue_tag`, `applicant_status`, `heir_location_knowledge` | `src/lib/local-lots.ts` — `LandCaseType`, `ApplicationAge`, `AvailableRecord`, `LandIssueTag`, `ApplicantStatus`, `HeirLocationKnowledge` |
| `land_record_geometries` shape, `geometry_type`, `geometry_category`, `line_style` | `src/lib/drawing-types.ts` — `DrawingObject`, `DrawingGeometryType`, `DrawingObjectCategory`, `DrawingLineStyle` |
| `land_points`, `point_type` (partially) | `src/lib/field-gps.types.ts` — `FieldGpsPoint`, `FieldGpsTrackPoint`; `src/components/FieldGpsLite.tsx` — `FoundPointRecord` |
| `land_parties` | `src/lib/local-lots.ts` — `LocalPdfIdentities` (surveyor/witness/villageHead/applicant) + `LandRecordDetails.originalApplicantName`/`mainHeirName`/`relationshipToApplicant` |
| `feedback`, `feedback_issue_type` | `src/lib/feedback/feedbackStorage.ts` — `FeedbackEntry`, `FeedbackIssueType` |
| `region_id` | `src/lib/region/regionStorage.ts` — `RegionId` |

`profiles`, `land_records.status`, `documents`, `service_requests`, and `activity_logs` have **no** existing client-local precedent (confirmed: no Supabase Storage usage anywhere in the repo, `ServiceRequestScreen` is a UI stub, no audit-log concept exists today). These were designed from the Sprint 01A report's approved shape and the existing UI's stated intent, not reverse-engineered from shipped code — flagged here for transparency, not hidden.

## JSONB usage — the one place this schema uses it

**Where:** `land_record_geometries.coordinates` only. Nowhere else in the new schema uses JSONB for structured data (`activity_logs.metadata` also uses `jsonb`, but as free-form audit context, not as a substitute for real columns).

**Why:** it is an unmodified copy of the coordinate array shape the client already produces (`DrawingCoordinate[]` → `[{lat,lng}, ...]`), and the same representation `lots.polygon_geojson` already uses today. Choosing anything else (e.g. a normalized `land_record_geometry_vertices` table) would require a coordinate-handling code change in the client to populate it — explicitly out of scope ("jangan sentuh coordinate/BRSO/WGS84 logic").

**Structure:** a JSON array of `{lat, lng}` pairs (or a nested ring array for polygons, matching `lots.polygon_geojson`'s existing GeoJSON-ring convention).

**Validation:** a `CHECK (jsonb_typeof(coordinates) = 'array')` constraint enforces the top-level shape. Deeper structural validation (numeric bounds, ring closure, minimum vertex count) is **not** enforced in SQL — it is left to the application layer, matching how the client already validates before sending data today. This is a deliberate scope boundary, not an oversight.

**Future migration risk:** if the product ever needs spatial queries (e.g. "find geometries within N metres of a point," "find overlapping parcels"), this column would need to move to a PostGIS `geometry(Polygon, 4326)` type. That migration is nontrivial (requires the PostGIS extension, a data backfill converting every existing JSONB ring into a real geometry value, and updated spatial indexes) and is explicitly **not** part of this sprint. Flagged as an **OWNER DECISION REQUIRED** item below.

## Cascade / delete-behavior reasoning

Every `ON DELETE` choice is justified individually (not a blanket default) — see `## Foreign keys and delete behavior` in the final report for the full table. Summary of the reasoning applied:

- **CASCADE** is used only where the child row is *compositionally* meaningless without its parent (`land_record_geometries`, `land_parties` → `land_records`; `profiles` → `auth.users`; `land_records` → `auth.users`, on the reasoning that personal case data tied to a deleted identity should not persist ownerless).
- **SET NULL** is used where the child row represents *something that happened* and retains standalone value even if its parent disappears (`land_points`, `service_requests`, `feedback`, `activity_logs`, and all `uploaded_by`/`captured_by`/`actor_id` references to `auth.users`).
- `documents.land_record_id` uses CASCADE rather than SET NULL — the one place this required a judgment call between two defensible options. Reasoning: private, sensitive files (title deeds, receipts) uploaded specifically for a given record should not persist as harder-to-reason-about orphans once their sole authorization path (the record's owner) is gone. This is flagged as an **OWNER DECISION REQUIRED** item since a document-retention product requirement could reasonably override this default.

## Owner decisions required

These are open design questions, not defects. Each currently has the strictest/safest default applied so the migration set is safe to review as-is; none of them block review, but all should be explicitly decided before Sprint 01B-2 (execution against Dev).

1. **Admin provisioning process.** `profiles.role` exists as a column but no policy in this migration set grants any elevated access based on it, and no mechanism assigns `admin`/`land_officer`/`surveyor` roles to anyone (no hardcoded email, no self-service path — self-promotion is actively blocked by `prevent_profile_role_escalation()`). How does a user actually become an admin? (Typical answer: a manual `update profiles set role = 'admin'` run by a human with direct database access / service-role, outside the app entirely — but this should be an explicit decision, not an assumption.)
2. **Admin read access scope.** Once an admin model exists, which tables should admins be able to read across all owners — `feedback` and `service_requests` only, or also `land_records`? Marked `ADMIN POLICY PENDING OWNER APPROVAL` throughout.
3. **`activity_logs` read access.** Should a land_record's owner be able to see the activity history of their *own* record? Doing this correctly requires a per-`entity_type` ownership lookup (the table is intentionally polymorphic, so there is no single FK to join on generically). Not implemented this sprint — currently nobody except a future service-role process can read this table at all.
4. **`documents.land_record_id` cascade vs. retain-on-delete-record.** See above.
5. **`land_points.land_record_id` — SET NULL confirmed correct?** This sprint changed it from Sprint 01A's original CASCADE suggestion to SET NULL (field measurements have standalone evidentiary value). Confirm this product reasoning is agreed.
6. **PostGIS migration timing.** See JSONB section above — not needed now, but worth deciding *when* it becomes needed so it isn't discovered under time pressure later.
7. **Feedback / service request mutability.** Both are currently fully immutable once submitted (no UPDATE/DELETE policy for the submitter at all). Should users be able to edit or withdraw their own submission before it's actioned?
8. **PII retention policy.** No TTL/deletion policy exists for `feedback`, `land_parties.id_number`, or precise `land_points` coordinates. Indefinite retention is the implicit current default — confirm this is acceptable, especially for `id_number`.
9. **`land_parties.id_number` protection.** No column-level encryption or masking is applied in this migration. RLS restricts *who* can query the table at all (owner-only), but does not mask the value once a legitimate owner reads their own row (which is expected/correct) — the open question is whether this column needs encryption-at-rest or application-layer masking for exports/PDF generation, given it's a government ID number.

## Rollback

See `supabase/migration_docs/sprint-01b1-rollback-manual.sql`, marked `DO NOT RUN AUTOMATICALLY`. Summary: drop objects in exact reverse dependency order (activity_logs → service_requests → feedback → documents → land_parties → land_points → land_record_geometries → land_records → profiles → enums → helper function). `public.lots` and `public.dev_migrations` content are never referenced by the rollback script and cannot be affected by it.
