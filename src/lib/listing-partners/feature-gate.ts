// Sprint listing-partner-backend: Production/Dev write gate for the
// listing_partners module. Deliberately its own file/constant, not a
// reuse of land-records/feature-gate.ts's isCloudWriteEnabled() -- see
// docs/ai/SPRINT_BRIEF_listing-partner-backend.md's Design decision 3
// for the full reasoning (that constant gates all five land-records
// write-coordinators as one group; wiring an unrelated module to it
// would incorrectly couple their activation).
//
// isTargetingSabahlotDevProject() IS reused (imported, not copied) from
// land-records/feature-gate.ts -- it is a pure NEXT_PUBLIC_SUPABASE_URL
// string check with no land-records business logic in it, so
// duplicating it here would only risk the two copies drifting apart.

import { isTargetingSabahlotDevProject } from "../land-records/feature-gate";

// Ships true for Dev, matching every other module's own write-enabled
// constant in this repo -- Dev-only writes have never been the thing
// gated false by default; Production is what stays closed (see
// isTargetingSabahlotDevProject() below, and the NODE_ENV check).
const LISTING_PARTNER_CLOUD_WRITE_ENABLED_CONSTANT = true;

export function isListingPartnerCloudWriteEnabled(): boolean {
  return (
    LISTING_PARTNER_CLOUD_WRITE_ENABLED_CONSTANT &&
    process.env.NODE_ENV !== "production" &&
    isTargetingSabahlotDevProject()
  );
}
