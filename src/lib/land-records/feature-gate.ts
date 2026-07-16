// Sprint 02B/02C: gates cloud read and cloud write to Dev only.
//
// No existing feature-flag mechanism or env-based Dev/Beta/Prod switch
// exists elsewhere in this repo (checked: no NODE_ENV/isDev checks
// gate any data path today). Per Sprint 02B section 6 priority order,
// falling back to option 3: an internal constant, disabled unless
// combined with Next.js's own NODE_ENV, defaulting closed. No .env
// variable was added for this -- flipping this constant is the only
// way to change it, and it must be flipped back to false before this
// code path is ever exposed to Beta/Production.
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

export function isCloudReadEnabled(): boolean {
  return (
    CLOUD_READ_ENABLED_CONSTANT && process.env.NODE_ENV !== "production"
  );
}

// Sprint 02C-2: now also requires isTargetingSabahlotDevProject() --
// see that function's comment. Deliberately not applied to
// isCloudReadEnabled() above; that gate's env-only weakness is the same
// but is out of this sprint's stated scope (parent land_records write
// UI wiring only) and is flagged separately in the Sprint 02C-2 report
// instead of being changed here.
export function isCloudWriteEnabled(): boolean {
  return (
    CLOUD_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV !== "production" &&
    isTargetingSabahlotDevProject()
  );
}
