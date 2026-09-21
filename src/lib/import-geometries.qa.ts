import assert from "node:assert/strict";
import { parseImportedGeometry } from "./import-geometries";

const csv = [
  "lat,lng",
  "5.9800,116.0700",
  "5.9810,116.0700",
  "5.9810,116.0710",
].join("\n");

assert.throws(
  () => parseImportedGeometry("lot.csv", csv),
  /CRS_UNCONFIRMED/,
  "CSV without declared CRS must fail closed",
);

assert.throws(
  () => parseImportedGeometry("lot.csv", csv, { sourceCrs: "EPSG:29873" }),
  /TRANSFORM_REQUIRED/,
  "Recognized projected CRS must not be silently transformed",
);

const csvWgs84 = parseImportedGeometry("lot.csv", csv, {
  sourceCrs: "EPSG:4326",
});
assert.equal(csvWgs84.crs.sourceCrs, "EPSG:4326");
assert.equal(csvWgs84.crs.status, "VERIFIED_NATIVE");
assert.equal(csvWgs84.crs.transformationApplied, false);
assert.equal(csvWgs84.kind, "polygon");
assert.equal(csvWgs84.evidence.evidenceClass, "IMPORTED_REFERENCE");
assert.equal(csvWgs84.evidence.officialUseAllowed, false);

const geoJson = JSON.stringify({
  type: "Feature",
  properties: {},
  geometry: {
    type: "Point",
    coordinates: [116.07, 5.98],
  },
});
const geo = parseImportedGeometry("point.geojson", geoJson);
assert.equal(geo.crs.sourceCrs, "EPSG:4326");
assert.equal(geo.crs.status, "VERIFIED_NATIVE");
assert.equal(geo.evidence.evidenceClass, "IMPORTED_REFERENCE");
assert.equal(geo.evidence.officialUseAllowed, false);

const legacyGeoJson = JSON.stringify({
  type: "Feature",
  crs: {
    type: "name",
    properties: { name: "EPSG:29873" },
  },
  properties: {},
  geometry: {
    type: "Point",
    coordinates: [116.07, 5.98],
  },
});
assert.throws(
  () => parseImportedGeometry("legacy.geojson", legacyGeoJson),
  /CRS_UNCONFIRMED/,
  "Legacy GeoJSON with explicit CRS metadata must not be guessed",
);

console.log("Import geometry CRS preflight QA: ALL PASS");
