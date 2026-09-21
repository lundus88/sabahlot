import assert from "node:assert/strict";
import { classifyEvidence, evidenceLabel } from "./evidence-confidence";

const official = classifyEvidence({
  source: "official-record",
  authority: "government-or-statutory-record",
  authorityReference: "REF-123",
});
assert.equal(official.evidenceClass, "OFFICIAL_RECORD");
assert.equal(official.officialUseAllowed, false);

const fakeOfficial = classifyEvidence({
  source: "official-record",
  authority: "user-declared",
  authorityReference: "REF-123",
});
assert.notEqual(fakeOfficial.evidenceClass, "OFFICIAL_RECORD");

for (const source of ["rtk-gnss", "total-station"] as const) {
  const decision = classifyEvidence({
    source,
    instrumentEvidencePresent: true,
    observationQualityKnown: true,
  });
  assert.equal(decision.evidenceClass, "SURVEY_OBSERVATION");
  assert.equal(decision.officialUseAllowed, false);
  assert.match(decision.restrictions.join(" "), /does not establish cadastral\/legal authority/);
}

const phone = classifyEvidence({ source: "phone-gps" });
assert.equal(phone.evidenceClass, "APPROXIMATE");

const keyed = classifyEvidence({ source: "keyed-coordinate" });
assert.equal(keyed.evidenceClass, "FIELD_REFERENCE");

const badImport = classifyEvidence({
  source: "csv-import",
  sourceCrsVerified: false,
});
assert.equal(badImport.evidenceClass, "UNVERIFIED");

const goodImport = classifyEvidence({
  source: "kml-import",
  sourceCrsVerified: true,
  transformationVerified: true,
});
assert.equal(goodImport.evidenceClass, "IMPORTED_REFERENCE");

const remote = classifyEvidence({ source: "lidar" });
assert.equal(remote.evidenceClass, "FIELD_REFERENCE");

assert.equal(evidenceLabel(goodImport), "IMPORTED REFERENCE");

console.log("Evidence Confidence Engine P0 QA: ALL PASS");
