# SabahLot — Architecture Decision Records (ADR)

Each decision is recorded once and never silently overridden. If a later sprint needs to change one, add a new ADR that supersedes it explicitly (do not edit history).

---

### ADR-001
**Decision:** Every cloud-writable local object (land record, geometry, point, party) reuses its existing client-generated `id` as the stable cloud primary key. IDs are never regenerated on retry.
**Reason:** Enables idempotent create (see ADR-002) and satisfies the invariant `one local object = one cloud row`.
**Consequences:** Non-UUID legacy local IDs (from before `crypto.randomUUID()` was consistently available) cannot be uploaded automatically — they return `legacy_id_requires_migration_mapping` / `legacy_child_id_requires_mapping` and must go through a future, explicit migration-mapping sprint.
**Status:** Accepted (Sprint 02C-1, extended Sprint 02D-1A).

### ADR-002
**Decision:** Create uses plain `INSERT`, never `UPSERT`. A retry that hits Postgres `23505` (unique violation) is resolved by reading the existing row (under RLS) and comparing its allowlisted content against the requested payload.
**Reason:** `UPSERT` would silently overwrite a row with different content on retry, masking the difference between "this exact request already succeeded" and "someone/something else changed this row." A HIGH-severity finding in Sprint 02C-1's independent review confirmed the naive version of this check (ownership-only, no content comparison) was unsafe.
**Consequences:** Same-id + same-content retry → verified idempotent success. Same-id + different-content retry → `duplicate_conflict`, row and cache untouched, no automatic retry. Unreadable/inaccessible duplicate → `not_found` / `not_found_or_forbidden` (never reveals whether the id belongs to another user).
**Status:** Accepted (Sprint 02C-1 Patch 1). Do not use `UPSERT` in any future child-table sprint without a new ADR explicitly justifying it.

### ADR-003
**Decision:** Update uses optimistic concurrency: the UPDATE statement itself filters on both `id` AND `updated_at = expectedUpdatedAt` atomically (never a separate SELECT-then-UPDATE).
**Reason:** Prevents a stale client from silently overwriting a row that changed elsewhere (another device, or a concurrent save) — the atomic filter means a stale caller's UPDATE matches zero rows instead of racing.
**Consequences:** A zero-row UPDATE result is ambiguous (not-found vs. not-owned vs. stale) and requires a read-only diagnosis step afterward, which must never reveal existence of another user's row (see ADR-004) and must never update the cache.
**Status:** Accepted (Sprint 02C-1, reused identically for geometry in Sprint 02D-1A).

### ADR-004
**Decision:** When RLS makes "row doesn't exist" and "row belongs to another user" indistinguishable, both cases are reported identically (`not_found` / `not_found_or_forbidden`), never as a distinct `forbidden`.
**Reason:** Returning a distinct "forbidden" for another user's row would leak the row's existence to a caller who has no right to know it — an enumeration side-channel.
**Consequences:** Slightly less precise error messages for legitimate not-found cases, in exchange for closing the enumeration channel entirely.
**Status:** Accepted (Sprint 02C-1, Sprint 02D-1A).

### ADR-005
**Decision:** Owner/user identity (`owner_id`, `captured_by`) is always derived server-side from `supabase.auth.getUser()` inside the repository/coordinator layer. It is never accepted as a field on any create/update input type, and the database payload is built as `{ ...allowlistedFields, id, owner_id: sessionUserId }` — session-derived fields spread LAST so they always win even if the allowlist ever regresses.
**Reason:** Structural prevention of owner/attribution spoofing, independent of RLS. A MEDIUM finding in the Sprint 02D-0 audit noted that `land_points`' RLS does not itself constrain `captured_by` on the linked branch — this ADR is the compensating application-layer control for that gap.
**Consequences:** Any future child-table (points, parties) write path MUST follow this exact pattern; a code reviewer should reject any create/update input type that includes an owner/user field.
**Status:** Accepted (Sprint 02C-1, extended Sprint 02D-1A; mandatory for points per Sprint 02D-0A).

### ADR-006
**Decision:** Authorization boundary is RLS, not application code. No repository function accepts or checks an owner id passed by the caller; every table's INSERT/UPDATE/SELECT/DELETE policy independently enforces `owner_id = auth.uid()` (directly, or via `EXISTS` through the parent `land_records` row for child tables).
**Reason:** Defense that survives an application bug — even if a coordinator function had a logic error, RLS is the actual enforcement layer.
**Consequences:** Every new child table's migration must include RLS policies proven (via written cross-user test scenarios) before any write code is built against it.
**Status:** Accepted (Sprint 01B-1 onward).

### ADR-007
**Decision:** Client-side cache (`sabahlot_cloud_land_records_v1:<user-uuid>`) is namespaced by the authenticated user's UUID. There is no "current user" global; every cache function takes the user id explicitly.
**Reason:** Prevents a stale/wrong cache from becoming active after logout or account switch, and makes cross-user cache leakage structurally hard to introduce by accident.
**Consequences:** Anonymous sessions never read or write this cache at all (no cloud query happens for them in the first place).
**Status:** Accepted (Sprint 02B).

### ADR-008
**Decision:** Parent-then-child staged sync, not a database transaction/RPC. `land_records` is created/updated first (already merged); geometry, points, and parties are each written as independent, individually-atomic operations after the parent exists. No RPC or Postgres transaction function wraps multiple tables.
**Reason:** PostgREST (via `@supabase/supabase-js`) has no native multi-table transaction; building one requires a new Postgres function, which is a migration — out of scope for a frontend/repository sprint. A staged approach with honest partial-failure reporting is safer than a false sense of atomicity.
**Consequences:** A child write can fail independently of the parent or of other children. The UI/consumer must handle and clearly display `partial_sync` (see ADR-009) rather than assuming all-or-nothing.
**Status:** Accepted (Sprint 02D-0A).

### ADR-009
**Decision:** Sync status uses specific, honest labels — `record_synced`, `geometry_synced`, `points_synced`, `parties_synced`, `core_record_synced`, `partial_sync`, `points_out_of_sync` — never a generic `synced` for a write flow, and never `full_record_synced`.
**Reason:** A bare "synced" (or a premature "full") would imply more of the record is safely in the cloud than actually is. `core_record_synced` explicitly excludes `documents`, which is out of scope until its own sprint.
**Consequences:** UI copy (when eventually built) must reflect the specific state, not collapse it to a generic "saved" indicator.
**Status:** Accepted (Sprint 02C-1 for the parent-only states; Sprint 02D-0A for the child/core states).

### ADR-010
**Decision:** `full_record_synced` must not be used until `documents` is implemented and confirmed synced alongside parent + geometry + points + parties.
**Reason:** Documents are explicitly out of scope for the current cloud-write sprint series (see ADR-012). Using "full" before they exist would be a false claim.
**Consequences:** `ChildSyncState` / `WriteSyncState` type unions intentionally omit `full_record_synced` as a value at all — it is not merely "unused," it does not exist as a reachable state today.
**Status:** Accepted (Sprint 02D-0A).

### ADR-011
**Decision:** Points cloud write is **create-only** in Sprint 02D. No UPDATE, no DELETE, no `updated_at`-based conflict control for points.
**Reason:** `land_points` has no `updated_at` column and no update trigger (confirmed by direct migration audit, Sprint 02D-0/02D-0A) — building optimistic-concurrency UPDATE for points would require a new migration, which is out of scope. Building UPDATE without conflict control would risk silent stale overwrites.
**Consequences:** Editing a point locally after it has been cloud-synced must surface a `points_out_of_sync` state (not a false `points_synced`), never silently re-upload as a new row, never delete+recreate as a workaround.
**Status:** Accepted (Sprint 02D-0A). Revisit only via a new ADR after an explicit owner decision to add `updated_at` to `land_points` (which requires a migration sprint).

### ADR-012
**Decision:** Documents and Supabase Storage (bucket creation, file upload, signed URLs, document metadata write) are entirely out of scope for the current cloud-write sprint series and will be their own, later, separately-scoped sprint.
**Reason:** Established since Sprint 02A's architecture review; reconfirmed at every subsequent gate (02D-0, 02D-0A).
**Status:** Accepted, standing.

### ADR-013
**Decision:** Delete (and archive) for geometry, points, and parties is deferred — not built in Sprint 02D.
**Reason:** Owner decision (Sprint 02D-0A) to keep the initial cloud-write surface minimal and reversible; delete semantics (hard vs. soft, cascade behavior, audit trail) need their own explicit design decision.
**Status:** Accepted, standing until a future sprint explicitly scopes delete.

### ADR-014
**Decision:** `land_parties.id_number` (government ID number) is never sent to the cloud in Sprint 02D. Only PDPA-minimal fields (name, role, contact reference, general notes) are cloud-writable.
**Reason:** `id_number` is flagged HIGH SENSITIVITY in its own migration comment since Sprint 01B-1; no column-level encryption/masking exists yet, and PDPA Malaysia treats government ID numbers as sensitive personal data requiring extra protection.
**Consequences:** `id_number` remains local-only until an explicit owner decision on encryption/masking strategy, tracked as a standing owner-decision item.
**Status:** Accepted (Sprint 02D-0A).

### ADR-015
**Decision:** One active geometry per `land_record` is enforced at the application layer (a pre-INSERT check against existing geometries for the same parent), not by a database unique constraint.
**Reason:** No unique constraint exists on `land_record_geometries` and adding one requires a migration, out of scope for Sprint 02D-1A.
**Consequences:** This has a documented, accepted TOCTOU race under true concurrent requests (two simultaneous creates for the same parent could theoretically both pass the check) — tracked as a MEDIUM finding, not silently hidden, and not a blocker for the sprint that introduced it.
**Status:** Accepted with known limitation (Sprint 02D-1A). Revisit if concurrent-create abuse is ever observed in practice.
