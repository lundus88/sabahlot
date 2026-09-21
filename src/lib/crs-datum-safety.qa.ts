import assert from "node:assert/strict";
import {
  assessImportCrs,
  assertImportCrsSafe,
  normalizeDeclaredImportCrs,
} from "./crs-datum-safety";

assert.equal(normalizeDeclaredImportCrs("WGS84"), "EPSG:4326");
assert.equal(normalizeDeclaredImportCrs("EPSG:29873"), "EPSG:29873");
assert.equal(normalizeDeclaredImportCrs("something-unknown"), "UNKNOWN");

const kml = assessImportCrs("KML");
assert.equal(kml.status, "VERIFIED_NATIVE");
assert.equal(kml.sourceCrs, "EPSG:4326");
assert.doesNotThrow(() => assertImportCrsSafe(kml));

const geojson = assessImportCrs("GeoJSON");
assert.equal(geojson.status, "VERIFIED_NATIVE");
assert.doesNotThrow(() => assertImportCrsSafe(geojson));

const csvUnknown = assessImportCrs("CSV");
assert.equal(csvUnknown.status, "CRS_UNCONFIRMED");
assert.throws(() => assertImportCrsSafe(csvUnknown), /CRS_UNCONFIRMED/);

const csvWgs84 = assessImportCrs("CSV", "EPSG:4326");
assert.equal(csvWgs84.status, "VERIFIED_NATIVE");
assert.doesNotThrow(() => assertImportCrsSafe(csvWgs84));

for (const source of ["EPSG:29873", "GDM2000_BORNEO_RSO", "UTM"]) {
  const decision = assessImportCrs("CSV", source);
  assert.equal(decision.status, "TRANSFORM_REQUIRED");
  assert.equal(decision.transformationApplied, false);
  assert.throws(() => assertImportCrsSafe(decision), /TRANSFORM_REQUIRED/);
}

console.log("CRS & Datum Safety Engine P0 QA: ALL PASS");
