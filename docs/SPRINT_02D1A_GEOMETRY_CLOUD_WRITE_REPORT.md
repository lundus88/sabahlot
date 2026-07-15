# Sprint 02D-1A — Geometry Cloud Write Report

Date: 2026-07-15
Branch: `sprint-02d1a-geometry-cloud-write`
Scope: authenticated cloud **create** and **update** for `land_record_geometries` only.
Not in scope (by design, this sprint): UI wiring, `land_points`/`land_parties`/`documents` writes, DB migrations, unique constraints.

## 1. Design

Sprint 02D-1A adds a child-table write path that sits alongside the existing Sprint 02B (read) and Sprint 02C (`land_records` write) work, without modifying either:

- [child-types.ts](../src/lib/land-records/child-types.ts) — `ChildSyncState`/`ChildErrorCode`/`ChildWriteResult<T>`, a contract shared by all future child tables (geometry now; points/parties later). Deliberately separate from `types.ts`'s `WriteErrorCode`/`WriteSyncState` (Sprint 02C, `land_records` only) because child rows have a parent-ownership dimension `land_records` doesn't have, and geometry alone can never legitimately report `core_record_synced`.
- [geometry-validation.ts](../src/lib/land-records/geometry-validation.ts) — the only place that allowlists and validates a geometry create/update payload before it reaches the repository layer. Reuses `DRAWING_OBJECT_CATEGORY_VALUES`/`DRAWING_LINE_STYLE_VALUES` (now exported from [mapper.ts](../src/lib/land-records/mapper.ts)) instead of duplicating the enum lists, so read-path and write-path validation cannot drift apart.
- [geometry-repository.ts](../src/lib/land-records/geometry-repository.ts) — the only file that talks to Supabase for `land_record_geometries`. Plain `INSERT` (never `upsert`), and `UPDATE` scoped by both `id` and `updated_at` in the same query (atomic optimistic concurrency, not read-then-write).
- [geometry-write-coordinator.ts](../src/lib/land-records/geometry-write-coordinator.ts) — `createCloudGeometry` / `updateCloudGeometry`, the only public entry points. Orchestrates auth, validation, the "one active geometry per parent" check, duplicate/conflict resolution, and cache updates.
- [geometry-cache.ts](../src/lib/land-records/geometry-cache.ts) — `upsertCachedGeometry`, which patches only the `geometries` array of the one affected record inside the existing per-user cache (from `local-cache.ts`, Sprint 02B/02C). Never fabricates a parent record; a no-op if the parent isn't cached yet.

`index.ts` re-exports the five new modules; no other file's public surface changed.

Neither `createCloudGeometry` nor `updateCloudGeometry` is called from `src/app/page.tsx` or any other UI code — wiring is explicitly deferred to a future sprint (instruction 9 of this task, and already noted in the coordinator's file header).

## 2. Security / RLS

- Every write is gated by [feature-gate.ts](../src/lib/land-records/feature-gate.ts)'s `isCloudWriteEnabled()` before anything else runs.
- No function in this sprint accepts an owner/user id from the caller. `createCloudGeometry` takes only `landRecordId`; ownership is enforced entirely by Postgres RLS on `land_record_geometries` (verified against [supabase/migrations/202607110005_create_land_record_geometries.sql](../supabase/migrations/202607110005_create_land_record_geometries.sql)):
  - `select`/`insert`/`update`/`delete` policies all require `exists (select 1 from land_records lr where lr.id = land_record_geometries.land_record_id and lr.owner_id = auth.uid())`.
  - Ownership is derived from the parent `land_records` row, never duplicated onto the geometry row.
- `getGeometryById` and `listGeometriesForLandRecord` are RLS-scoped reads used only to disambiguate an ambiguous write outcome (duplicate-create retry, zero-row update). An id that exists but belongs to another user is reported identically to "not found" — ownership is never leaked through error messages.
- `GEOMETRY_SELECT_COLUMNS` in `geometry-repository.ts` matches the migration's columns exactly (`id, land_record_id, geometry_type, category, name, coordinates, line_style, color, weight, is_visible, area_m2, area_ha, area_acre, perimeter_m, length_m, start_bearing, end_bearing, created_at, updated_at`) — verified by direct comparison against the migration file.
- Confirmed (Test 45 / "no point/party/document write occurs"): this sprint's code path touches only `land_record_geometries`.

## 3. QA results

All QA scripts were compiled with `tsc` against a fake, in-memory Supabase client (no network) and run with `node`, per each file's own header instructions.

| Suite | File | Result |
|---|---|---|
| Sprint 02D-1A geometry write (46 checks) | [geometry-write.qa.ts](../src/lib/land-records/geometry-write.qa.ts) | **ALL PASS** |
| Sprint 02B land-records read (regression) | [land-records.qa.ts](../src/lib/land-records/land-records.qa.ts) | **ALL PASS** (10/10) |
| Sprint 02C land-records write (regression) | [land-records-write.qa.ts](../src/lib/land-records/land-records-write.qa.ts) | **ALL PASS** (16 numbered + supporting checks) |
| Local-only lot save/load (regression) | [local-lots.qa.ts](../src/lib/local-lots.qa.ts) | **PASS** |

No regressions were found in Sprint 02B/02C behaviour. No code changes were made to `write-coordinator.ts`, `cloud-repository.ts`, or the Sprint 02B/02C QA files — none were needed; all three regression suites passed unmodified against the current `mapper.ts`/`index.ts` changes.

The only pre-existing files touched this sprint are:
- `mapper.ts`: `DRAWING_OBJECT_CATEGORY_VALUES` and `DRAWING_LINE_STYLE_VALUES` changed from module-private `const` to `export const` (same values, same order — no behavioural change), so `geometry-validation.ts` can reuse them instead of duplicating the lists.
- `index.ts`: five new `export *` lines for the modules listed in section 1.

Test 16 ("unsupported CRS") is intentionally DOCUMENTED-ONLY, not executed: there is no CRS parameter anywhere in the current model to reject — coordinates are implicitly and unconditionally WGS84 `{lat, lng}`, matching every other geometry read/write path in the app. This is not a gap introduced by this sprint.

## 4. Idempotency (create)

`createGeometryRow` always does a plain `INSERT` with the caller-supplied stable id (never `upsert`), so a retried create surfaces as Postgres `23505` rather than silently overwriting. `resolveDuplicateGeometryCreate` then applies the same three-outcome pattern already proven in Sprint 02C-1 (`land_records`):

1. **Not readable / not owned** → `not_found_or_forbidden` (no detail leaked about who owns it).
2. **Owned, but content differs** from the retried payload → `duplicate_conflict`; the existing row and the cache are left untouched, and this is never silently retried.
3. **Owned, and content matches** → treated as a verified success (`geometry_synced`), cache updated from the existing row.

Comparison is field-by-field via `buildComparableGeometryPayload` / `extractComparableFieldsFromGeometryRow` / `areGeometryPayloadsEquivalent`, deliberately excluding `id`, `land_record_id`, `created_at`, `updated_at` — only fields the caller actually controls on create. Coordinate arrays are compared by normalized JSON (order-sensitive, matching that a ring/line's point order is meaningful).

## 5. Optimistic concurrency (update)

`updateGeometryRow` scopes its `UPDATE` by **both** `id` and the caller's last-known `updated_at` in a single atomic query — not a separate read-then-write. If another device or request has changed the row since, the `UPDATE` matches zero rows (Postgres `PGRST116` via PostgREST), and `resolveNoRowsUpdatedGeometry` performs a read-only lookup to distinguish:

- Row not visible to this user at all → `not_found_or_forbidden`.
- Row visible, so the only explanation for zero rows matched is that `updated_at` moved on → `conflict` / `stale_conflict`, with the current server copy returned in `serverData` so the caller can reconcile. The local cache is deliberately **not** touched on a conflict, so it never looks synced when it isn't.

The parent (`land_record_id`) cannot be changed via update — it is structurally absent from `UpdateGeometryInput`.

## 6. Cache behaviour

`upsertCachedGeometry` only ever touches the `geometries` array of the one `land_record` a write succeeded against, inside that authenticated user's existing cache (`local-cache.ts`, established Sprint 02B/02C). Confirmed by QA:

- A successful create/update updates only the acting user's cache, and only that one record's geometry list (Tests 37, 38, 40).
- Any failure — validation, database error, duplicate conflict, stale conflict — leaves the cache exactly as it was (Tests 25, 33, 39).
- If the parent record isn't present in the cache yet, the update is a no-op rather than fabricating a partial record.

## 7. "One active geometry per parent" control

Enforced at the **application level only**, inside `createCloudGeometry`: before inserting, the coordinator lists existing geometries for the target `land_record_id` and rejects the create if any row exists with a *different* id (`validation_failed`, "update it instead of creating a new one"). This is a product rule (each land record currently has at most one authoritative boundary), not a database constraint — there is no unique index on `land_record_geometries` today.

## 8. Risk: TOCTOU gap — MEDIUM

**Finding:** the "one active geometry per parent" check (section 7) is a read (`listGeometriesForLandRecord`) followed by a separate write (`createGeometryRow`), with no database-level constraint tying them together. Under genuinely concurrent requests (two tabs, two devices, or a retried request racing a first attempt) for the *same* `land_record_id` with two *different* geometry ids, both could pass the read check before either has written, resulting in two active geometry rows for one parent — a state the application never intends to allow.

This is **not** exercised by the current QA suite's "conceptual/mock" concurrency tests (Tests 28/29), which run single-threaded and only cover the same-id duplicate-create path, not two-different-ids-same-parent racing past the list-then-insert check.

**Severity:** MEDIUM — requires two genuinely concurrent requests targeting the same parent with different geometry ids, which is an unusual but plausible client scenario (e.g. a retry with a freshly-regenerated id after a perceived failure, or two devices both drawing a first boundary for the same record before either syncs). No data loss or cross-user exposure results; the failure mode is two geometry rows existing where the product model expects one.

**Explicitly not fixed this sprint**, per scope: no unique constraint or migration was added. Recommended for a follow-up sprint:
- Add a partial unique index enforcing at most one geometry per `land_record_id` at the database level (exact shape — e.g. whether "one active geometry" should instead become "one geometry per category per parent" — needs an owner decision, since the current check treats *any* second id as a conflict regardless of category), or
- Accept two rows as valid and make "which one is authoritative" an explicit, ordered concept instead of an implicit invariant.

## 9. Out of scope / not touched this sprint (confirmed)

- No UI wiring: `createCloudGeometry`/`updateCloudGeometry` are not called from `page.tsx` or anywhere else.
- No changes to `write-coordinator.ts`, `cloud-repository.ts`, or Sprint 02B/02C QA files.
- No DB migrations, no unique constraints.
- No polygon/topological validation (self-intersection, OGC validity) — `geometry-validation.ts` performs structural and coordinate-range validation only; this was already flagged as a future decision, not solved here.
- `land_points`, `land_parties`, `documents` writes remain untouched (confirmed by QA Test 45).

## 10. Housekeeping

- `supabase/.temp/` (Supabase CLI local state — project ref, tool versions, pooler URL) added to `.gitignore`; it is local machine state, not project source.
