// Sprint 02B: gates cloud read to Dev only.
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

export function isCloudReadEnabled(): boolean {
  return (
    CLOUD_READ_ENABLED_CONSTANT && process.env.NODE_ENV !== "production"
  );
}
