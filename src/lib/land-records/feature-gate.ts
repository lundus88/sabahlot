// Sprint 02B/02C: gates cloud read and cloud write to Dev only.
//
// No existing feature-flag mechanism or env-based Dev/Beta/Prod switch
// existed elsewhere in this repo at the time. Per Sprint 02B section 6,
// the original implementation used internal constants plus NODE_ENV.
// Alpha later became a Vercel production build targeting sabahlot-dev, so
// the write gate now relies on the exact dev-project hostname instead (see
// isCloudWriteEnabled below). No runtime override was added.
const CLOUD_READ_ENABLED_CONSTANT = true;

// Sprint 02C: deliberately a SEPARATE constant from the read gate
// above, so read and write can be enabled/disabled independently.
const CLOUD_WRITE_ENABLED_CONSTANT = true;

// Sprint 02C-2 (independent review fix): NODE_ENV !== "production" alone
// only proves "this is not a production build" -- it says nothing about
// which Supabase project the build is actually configured to hit. A
// non-production build accidentally pointed at Beta/Production
// (`sabahlot`/`hakncr`) via NEXT_PUBLIC_SUPABASE_URL would previously
// have sailed through this gate. `sabahlot-dev`'s project ref
// (docs/ai/PROJECT_STATE.md) is not a secret -- it's the public,
// non-sensitive half of the project URL -- so it is safe to compare
// against directly. The full URL, any token, and any key are
// deliberately never returned, logged, or included in an error message
// anywhere in this file -- only a boolean ever leaves this function.
const SABAHLOT_DEV_PROJECT_REF = "xsflrehitrmobiyfbfhk";
const SABAHLOT_DEV_HOSTNAME = `${SABAHLOT_DEV_PROJECT_REF}.supabase.co`;

// Sprint production-read-gate-phase1 (ADR-019): sabahlot-production's ref,
// same non-secret status as the dev ref above. PRODUCTION_READ_ENABLED_CONSTANT
// is a SEPARATE switch from CLOUD_READ_ENABLED_CONSTANT (dev). It is
// intentionally never exported or exposed to a runtime override (env var,
// query param, etc.): the only way to change it is to edit this file and
// ship a new commit.
const SABAHLOT_PRODUCTION_PROJECT_REF = "mrkhhdfxoomkzirwgnwx";
const SABAHLOT_PRODUCTION_HOSTNAME = `${SABAHLOT_PRODUCTION_PROJECT_REF}.supabase.co`;

// Sprint production-read-activation-phase1 (ADR-025): flipped from its
// shipped-false value to true, 2026-08-04, on explicit owner instruction --
// the separate, standalone activation decision every prior ADR touching
// this constant (019 onward) said would be required. This does NOT by
// itself expose any data to a real user: no UI code calls
// loadCloudLandRecords()/isCloudReadEnabled() anywhere in this app (see
// ADR-025 and the "Land Record cloud read" row in MODULE_STATUS.md) --
// this flip only makes the gate itself correctly open for a production
// build whose NEXT_PUBLIC_SUPABASE_URL is genuinely sabahlot-production,
// which also still requires an owner-only Vercel Production env change
// this AI has not made and cannot make. All five
// PRODUCTION_*_WRITE_ENABLED_CONSTANTs (ADR-020-024) are UNCHANGED and
// still ship false -- this is a read-only activation.
const PRODUCTION_READ_ENABLED_CONSTANT = true;

/**
 * Fails closed: any missing, malformed, or non-matching
 * NEXT_PUBLIC_SUPABASE_URL returns false. Only a build whose configured
 * Supabase URL's hostname is EXACTLY `xsflrehitrmobiyfbfhk.supabase.co`
 * (Beta/Production's `sabahlot`/`hakncr` projects have different refs
 * and therefore different hostnames) returns true.
 */
export function isTargetingSabahlotDevProject(): boolean {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return false;

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    parsed.hostname.toLowerCase() === SABAHLOT_DEV_HOSTNAME
  );
}

/**
 * Same fail-closed matching as isTargetingSabahlotDevProject(), against
 * sabahlot-production's hostname instead. Deliberately a standalone
 * function (not sharing a helper with the dev version above) so the
 * already-verified dev matching logic stays untouched by this sprint.
 */
export function isTargetingSabahlotProductionProject(): boolean {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) return false;

  let parsed: URL;
  try {
    parsed = new URL(configuredUrl);
  } catch {
    return false;
  }

  return (
    parsed.protocol === "https:" &&
    parsed.hostname.toLowerCase() === SABAHLOT_PRODUCTION_HOSTNAME
  );
}

// Dev and Production are mutually exclusive branches, each with its own
// enable constant and its own NODE_ENV requirement (dev: anything but
// production; production: exactly production) -- a build cannot satisfy
// both isTargetingSabahlotDevProject() and isTargetingSabahlotProductionProject()
// at once, since the two hostnames differ.
export function isCloudReadEnabled(): boolean {
  if (isTargetingSabahlotDevProject()) {
    return CLOUD_READ_ENABLED_CONSTANT && process.env.NODE_ENV !== "production";
  }
  if (isTargetingSabahlotProductionProject()) {
    return PRODUCTION_READ_ENABLED_CONSTANT && process.env.NODE_ENV === "production";
  }
  return false;
}

// Both read and write gates require the exact sabahlot-dev project. Keeping
// their enable constants separate still allows either capability to be
// disabled independently without weakening the database boundary.
//
// Alpha is deployed by Vercel as a production build (NODE_ENV=production)
// while deliberately targeting sabahlot-dev. NODE_ENV therefore cannot be
// used to distinguish Alpha from the real Production database. The exact
// Supabase hostname matcher is the security boundary for this dev-only gate:
// a build pointed at sabahlot-production or any other project still fails
// closed. The five dedicated sabahlot-production write gates below remain
// separate and false.
export function isCloudWriteEnabled(): boolean {
  return (
    CLOUD_WRITE_ENABLED_CONSTANT &&
    isTargetingSabahlotDevProject()
  );
}

// Sprint production-write-gate-phase2a-land-records (ADR-020): a Production
// write path is opened PER MODULE, never as one blanket switch -- unlike
// isCloudReadEnabled() above, isCloudWriteEnabled() is consumed identically
// by all five write-coordinators (land_records, geometry, points, parties,
// documents), and src/app/page.tsx's save flow already calls all five
// unconditionally in sequence. A single Production branch added to
// isCloudWriteEnabled() itself would therefore open all five at once the
// moment its constant flipped, defeating the owner's module-by-module
// rollout decision. Each module instead gets its OWN dedicated function and
// OWN constant, called only from that module's own coordinator -- this is
// the first one. A future phase adding e.g. geometry would add
// isCloudWriteEnabledForGeometryInProduction() alongside this one, never
// modify isCloudWriteEnabled() itself, and never touch this function.
//
// Same non-runtime-configurable contract as PRODUCTION_READ_ENABLED_CONSTANT:
// ships false, never exported, no env var/query param override -- flipping
// it is a deliberate, standalone, separately-approved commit.
const PRODUCTION_PARENT_WRITE_ENABLED_CONSTANT = false;

/**
 * Production write gate for land_records ONLY. Geometry/points/parties/
 * documents each remain closed to Production regardless of this constant --
 * their coordinators call isCloudWriteEnabled() above, which never returns
 * true for a production-targeted project, and do not call this function.
 */
export function isCloudWriteEnabledForParentInProduction(): boolean {
  return (
    PRODUCTION_PARENT_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV === "production" &&
    isTargetingSabahlotProductionProject()
  );
}

// Sprint production-write-gate-phase2b-geometry (ADR-021): same per-module
// pattern as ADR-020 above, for geometry this time. Own function, own
// constant, called only from geometry-write-coordinator.ts's two gate
// call-sites (create/update) -- never from isCloudWriteEnabled() itself,
// never from land_records/points/parties/documents. child-ui-sync.ts (the
// UI wiring for geometry) has no gate check of its own -- it calls straight
// into geometry-write-coordinator.ts, so it needed no change for this
// sprint and inherits this behavior automatically.
//
// Same non-runtime-configurable contract as the constants above: ships
// false, never exported, no env var/query param override.
const PRODUCTION_GEOMETRY_WRITE_ENABLED_CONSTANT = false;

/**
 * Production write gate for geometry ONLY. land_records/points/parties/
 * documents each remain unaffected by this constant -- their coordinators
 * never call this function.
 */
export function isCloudWriteEnabledForGeometryInProduction(): boolean {
  return (
    PRODUCTION_GEOMETRY_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV === "production" &&
    isTargetingSabahlotProductionProject()
  );
}

// Sprint production-write-gate-phase2c-points (ADR-022): same per-module
// pattern as ADR-020/021, for points this time. Own function, own constant,
// called only from points-write-coordinator.ts's ONE gate call-site
// (createCloudPoint -- create-only per ADR-011, no update/delete exist) --
// never from isCloudWriteEnabled() itself, never from land_records/
// geometry/parties/documents. points-ui-sync.ts (the UI wiring for points)
// has no gate check of its own, same as geometry's child-ui-sync.ts -- it
// calls straight into points-write-coordinator.ts, so it needed no change.
//
// Same non-runtime-configurable contract as the constants above: ships
// false, never exported, no env var/query param override.
const PRODUCTION_POINTS_WRITE_ENABLED_CONSTANT = false;

/**
 * Production write gate for points ONLY. land_records/geometry/parties/
 * documents each remain unaffected by this constant -- their coordinators
 * never call this function.
 */
export function isCloudWriteEnabledForPointsInProduction(): boolean {
  return (
    PRODUCTION_POINTS_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV === "production" &&
    isTargetingSabahlotProductionProject()
  );
}

// Sprint production-write-gate-phase2d-parties (ADR-023): same per-module
// pattern as ADR-020/021/022, for parties this time. Own function, own
// constant, called only from parties-write-coordinator.ts's TWO gate
// call-sites (createCloudParty/updateCloudParty -- backend supports both,
// same shape as land_records/geometry) -- never from isCloudWriteEnabled()
// itself, never from land_records/geometry/points/documents.
// parties-ui-sync.ts (the UI wiring for parties) has no gate check of its
// own, same as geometry's/points' UI wiring -- it calls straight into
// parties-write-coordinator.ts, so it needed no change. ADR-014
// (id_number never sent) is entirely unaffected -- this sprint touches
// gate logic only, never the payload allowlist.
//
// Same non-runtime-configurable contract as the constants above: ships
// false, never exported, no env var/query param override.
const PRODUCTION_PARTIES_WRITE_ENABLED_CONSTANT = false;

/**
 * Production write gate for parties ONLY. land_records/geometry/points/
 * documents each remain unaffected by this constant -- their coordinators
 * never call this function.
 */
export function isCloudWriteEnabledForPartiesInProduction(): boolean {
  return (
    PRODUCTION_PARTIES_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV === "production" &&
    isTargetingSabahlotProductionProject()
  );
}

// Sprint production-write-gate-phase2e-documents (ADR-024): same per-module
// pattern as ADR-020/021/022/023, for documents this time -- the fifth and
// last module in the phased Production write rollout. Own function, own
// constant, called only from documents-write-coordinator.ts's ONE gate
// call-site (createCloudDocument -- create-only, no update/delete
// coordinator exists) -- never from isCloudWriteEnabled()
// itself, never from land_records/geometry/points/parties.
// documents-ui-sync.ts (the UI wiring for documents) has no gate check of
// its own, same as points'/geometry's UI wiring -- it calls straight into
// documents-write-coordinator.ts, so it needed no change.
//
// Same non-runtime-configurable contract as the constants above: ships
// false, never exported, no env var/query param override.
const PRODUCTION_DOCUMENTS_WRITE_ENABLED_CONSTANT = false;

/**
 * Production write gate for documents ONLY. land_records/geometry/points/
 * parties each remain unaffected by this constant -- their coordinators
 * never call this function.
 */
export function isCloudWriteEnabledForDocumentsInProduction(): boolean {
  return (
    PRODUCTION_DOCUMENTS_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV === "production" &&
    isTargetingSabahlotProductionProject()
  );
}
