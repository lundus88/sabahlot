# SabahLot — Database Contract

Documents the actual, migrated schema (`supabase/migrations/202607110001` through `...0012`) as of `main@37e717f74fd54f65f0312a289f7de87345f76527`. This file describes reality — if it ever disagrees with a migration file, the migration file is correct and this document is stale and must be fixed, not the other way around. Do not use this file as a substitute for reading the actual migration before writing schema-dependent code.

---

## `profiles`
- **Purpose:** One row per `auth.users` identity; app-facing preferences (name, phone, role, region). Role is NOT an authorization mechanism by itself.
- **Owner relationship:** `id` IS the `auth.users.id` (1:1), cascade delete.
- **RLS:** select/update own row only; insert own row only with `role = 'public_user'` enforced by both RLS `WITH CHECK` and a trigger (`prevent_profile_role_escalation`); no delete policy (lifecycle tied to `auth.users`).
- **Writable fields:** `full_name`, `phone`, `region`.
- **DB-controlled:** `id` (= session uid), `role` (trigger-protected, no legitimate self-service path to change it), `created_at`/`updated_at`.
- **ID strategy:** N/A (id = auth uid, not client-generated).
- **Conflict strategy:** N/A (no cloud-write coordinator built for this table; auto-provisioned via `handle_new_user()` trigger on signup).
- **Current implementation status:** Schema + RLS only. No application write path exists (profile edits are not yet built).

## `land_records`
- **Purpose:** Case/record-level metadata (lot info, applicant/heir summary, workflow status).
- **Owner relationship:** `owner_id → auth.users.id`, cascade delete.
- **RLS:** select/insert/update/delete scoped to `owner_id = auth.uid()`. Insert/update additionally gated on `status` by a two-layer defense (RLS `WITH CHECK` restricts INSERT to `status in ('draft','submitted')`; trigger `prevent_land_record_privileged_status` blocks any UPDATE that moves `status` to a privileged value).
- **Writable fields:** `record_name` (required), `lot_number`, `village`, `district`, `region`, `land_case_type`, `application_age`, `records_available`, `issue_tags`, `heirs_can_identify_location`, `land_history_notes`.
- **DB-controlled:** `id` (client-supplied stable UUID, not server-generated despite the default), `owner_id` (session-derived), `status` (default `'draft'`, trigger-protected), `created_at`/`updated_at`.
- **ID strategy:** Client-generated stable UUID, reused from the local record's existing id (ADR-001).
- **Conflict strategy:** INSERT + 23505 verification (ADR-002); UPDATE with atomic `id` + `updated_at` filter (ADR-003).
- **Current implementation status:** **Implemented and merged.** Read: `src/lib/land-records/cloud-repository.ts` / `index.ts`. Write: `write-coordinator.ts`, `validation.ts`. Not wired to Production UI.

## `land_record_geometries`
- **Purpose:** 1:N geometries per land record (parent lot polygon, proposed sub-lots, boundary/access/setback lines). Mirrors `DrawingObject` in `src/lib/drawing-types.ts`.
- **Owner relationship:** `land_record_id → land_records.id`, cascade delete. No independent owner column — ownership is 100% derived via `EXISTS` join to the parent's `owner_id`.
- **RLS:** select/insert/update/delete all via `EXISTS (... land_records lr WHERE lr.id = land_record_geometries.land_record_id AND lr.owner_id = auth.uid())`.
- **Writable fields:** `geometry_type`, `category`, `name`, `coordinates` (jsonb array of `{lat,lng}`), `line_style`, `color`, `weight`, `is_visible`, and the polygon-only (`area_m2/ha/acre`, `perimeter_m`) or line-only (`length_m`, `start_bearing`, `end_bearing`) fields, mutually exclusive by a DB CHECK constraint.
- **DB-controlled:** `id`, `land_record_id` (set once at create, never changed), `created_at`/`updated_at`.
- **ID strategy:** Client-generated stable UUID.
- **Conflict strategy:** Same pattern as `land_records` (INSERT+23505, atomic UPDATE filter) — see ADR-002/003.
- **Current implementation status:** Read merged (`main`). **Write implemented and independently reviewed (PASS), not yet committed** — see `sprint-02d1a-geometry-cloud-write`. No DB unique constraint for "one active geometry per parent" — enforced application-side only (ADR-015, known TOCTOU limitation).

## `land_points`
- **Purpose:** Consolidates `FieldGpsPoint`/`FieldGpsTrackPoint`/`FoundPointRecord` client shapes into one table.
- **Owner relationship:** Two-branch. `land_record_id` is **nullable** (`ON DELETE SET NULL`) — a point may exist before being attached to a saved record. `captured_by → auth.users.id` (`ON DELETE SET NULL`).
- **RLS:** `(land_record_id IS NOT NULL AND EXISTS(...owner_id = auth.uid()))` OR `(land_record_id IS NULL AND captured_by = auth.uid())`. **Known gap:** the linked branch does not itself constrain `captured_by` — the app layer must always set it from session (ADR-005), RLS alone does not.
- **Writable fields:** `point_type`, `label`, `latitude`, `longitude`, `altitude`, `accuracy_m`, `altitude_accuracy_m`, `heading`, `speed`, `quality_grade`, `capture_method`, `source`, `sample_count`, `occupation_seconds`, `distance_difference_m`, `bearing_degrees`, `note`, `captured_at`.
- **DB-controlled:** `id`, `land_record_id` (set at create), `captured_by` (session-derived, never accepted from caller), `created_at`.
- **ID strategy:** Client-generated stable UUID.
- **Conflict strategy:** **None — no `updated_at` column and no update trigger exist on this table.** Points are create-only until an explicit future migration adds conflict-control columns (ADR-011).
- **Current implementation status:** Not implemented. Design approved (Sprint 02D-0A) as create-only.

## `land_parties`
- **Purpose:** Named people tied to a land record (owner/applicant/heir/surveyor/witness/village head) — normalizes previously-flat client fields.
- **Owner relationship:** `land_record_id → land_records.id`, cascade delete. Ownership fully derived via parent, same pattern as geometries.
- **RLS:** select/insert/update/delete via `EXISTS` through parent, identical shape to `land_record_geometries`.
- **Writable fields (cloud-eligible, per ADR-014):** `party_role`, `full_name`, `relationship_to_applicant`, `contact_phone`, `contact_email`, `notes`.
- **Writable in schema but NOT cloud-eligible in current sprint scope:** `id_number` — HIGH SENSITIVITY (government ID number), local-only until an explicit encryption/masking decision.
- **DB-controlled:** `id`, `land_record_id`, `created_at`/`updated_at`.
- **ID strategy:** Client-generated stable UUID — **note:** no local client object currently carries a party `id` at all (parties today are flat string fields, e.g. `LocalPdfIdentityPerson {name, idNo}`); a new UUID must be generated on first cloud sync and persisted back locally (Sprint 02A/02D-0 finding).
- **Conflict strategy:** Same INSERT+23505 / atomic-UPDATE pattern as `land_records`/geometries (`updated_at` column exists).
- **Current implementation status:** Not implemented. Design approved (Sprint 02D-0A) as create + update, minus `id_number`.

## `documents`
- **Purpose:** Document METADATA only. No Supabase Storage bucket, no `storage.objects` policy, no upload capability exists yet — deliberately, per ADR-012.
- **Owner relationship:** Two-branch, same shape as `land_points` (`land_record_id` nullable/SET NULL, `uploaded_by → auth.users.id`).
- **RLS:** Same two-branch EXISTS-or-uploaded_by pattern as `land_points`. Same `uploaded_by` attribution caveat applies (must be app-enforced, not RLS-enforced, on the linked branch).
- **Writable fields:** `document_type`, `storage_bucket`, `storage_path`, `original_filename`, `mime_type`, `size_bytes`, `is_sensitive`.
- **DB-controlled:** `id`, `created_at`. No permanent public URL is ever stored — only bucket+path, meant to resolve to a short-lived signed URL at read time (future work).
- **ID strategy:** N/A yet (no write path exists).
- **Conflict strategy:** N/A (no `updated_at`/no update path defined; not yet designed).
- **Current implementation status:** Schema + RLS only, no application code. Out of scope until its own sprint (ADR-012).

## `feedback`
- **Purpose:** First cloud persistence for feedback (previously localStorage-only via `feedbackStorage.ts`).
- **Owner relationship:** `user_id → auth.users.id`, nullable (anonymous submission allowed), `ON DELETE SET NULL`.
- **RLS:** Select scoped to own `user_id` only (anonymous submissions are unreadable by anyone, including their own submitter, once written — intentional). Insert allowed for `anon` (only with `user_id IS NULL`) and `authenticated` (only `user_id IS NULL` or own uid). **No UPDATE/DELETE policy for anyone** — immutable once submitted.
- **Writable fields:** `submitted_name`, `phone`, `test_location`, `phone_type`, `browser`, `module_tested`, `issue_type`, `description`, `suggestion`, `screenshot_note`, `region`, `state`, `district`, `module`.
- **DB-controlled:** `id`, `created_at`.
- **ID strategy:** N/A (no write path built from the app yet — client still uses localStorage `feedbackStorage.ts`).
- **Conflict strategy:** N/A (immutable, no update path exists or is planned).
- **Current implementation status:** Schema + RLS only. Application still writes to localStorage exclusively; no cloud write code exists.

## `service_requests`
- **Purpose:** Support/assistance request tracking. No existing client-side data model — the current `ServiceRequestScreen` is a UI stub that redirects into the feedback flow.
- **Owner relationship:** `requester_id → auth.users.id` nullable/SET NULL; `land_record_id → land_records.id` nullable/SET NULL (a service request is standalone and must survive its referenced land record being deleted).
- **RLS:** Select scoped to own `requester_id`. Insert allowed for `anon` (only `requester_id IS NULL`) and `authenticated` (own uid or null). **No UPDATE/DELETE policy** — immutable, same as `feedback`.
- **Writable fields:** `request_type`, `contact_phone`, `contact_email`, `message`, `region`.
- **DB-controlled:** `id`, `status` (default `'new'`, no client update path), `assigned_to`, `created_at`/`updated_at` (trigger attached, currently inert since no UPDATE policy exists yet).
- **ID strategy:** N/A (no write path built).
- **Conflict strategy:** N/A (immutable currently).
- **Current implementation status:** Schema + RLS only. No application code (UI is a stub).

## `activity_logs`
- **Purpose:** Append-only audit trail. Polymorphic (`entity_type`/`entity_id`), currently wired only to `land_records` (create/update/delete/status_change events).
- **Owner relationship:** `actor_id → auth.users.id`, nullable/SET NULL. Not owner-scoped for read — see RLS below.
- **RLS:** Enabled, **zero policies for any client role** — no SELECT/INSERT/UPDATE/DELETE is possible for `anon` or `authenticated` under any circumstance. The only writer is `log_activity()` (SECURITY DEFINER, `EXECUTE` revoked from `public`/`anon`/`authenticated` — callable only from another SECURITY DEFINER trigger function, never directly).
- **Writable fields:** None, from any client role.
- **DB-controlled:** Everything — this table is 100% system-written.
- **ID strategy:** N/A.
- **Conflict strategy:** N/A (append-only, no update ever occurs).
- **Current implementation status:** Fully implemented and working (trigger `land_records_log_activity` fires on every `land_records` INSERT/UPDATE/DELETE). No read UI/API exists yet — owner decision pending on whether/how an owner should see their own record's activity history (would require a new, carefully-scoped read policy or RPC, not built).
