import assert from "node:assert/strict";
import { parseImportedGeometry } from "./import-geometries";
import { JSDOM } from "jsdom";
Object.assign(globalThis, { DOMParser: new JSDOM("").window.DOMParser });

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

const ring = "116.07,5.98,0 116.08,5.98,0 116.08,5.99,0 116.07,5.98,0";
const pk = "<Placemark><Polygon><outerBoundaryIs><LinearRing><coordinates>"+ring+"</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>";
const kml = (body: string) => "<kml><Document>"+body+"</Document></kml>";
assert.equal(parseImportedGeometry("one.kml",kml(pk)).kind,"polygon");
assert.throws(()=>parseImportedGeometry("two.kml",kml(pk+pk)),/MULTI_GEOMETRY_UNSUPPORTED/);
assert.throws(()=>parseImportedGeometry("mixed.kml",kml(pk+"<Placemark><Point><coordinates>116,5,0</coordinates></Point></Placemark>")) ,/MULTI_GEOMETRY_UNSUPPORTED/);
assert.throws(()=>parseImportedGeometry("hole.kml",kml(pk.replace("</Polygon>","<innerBoundaryIs><LinearRing><coordinates>"+ring+"</coordinates></LinearRing></innerBoundaryIs></Polygon>"))),/POLYGON_HOLES_UNSUPPORTED/);
const coordinates = [[[116.07,5.98],[116.08,5.98],[116.08,5.99],[116.07,5.98]]];
const ft={type:"Feature",geometry:{type:"Polygon",coordinates}};
assert.equal(parseImportedGeometry("one.geojson",JSON.stringify({type:"FeatureCollection",features:[ft]})).kind,"polygon");
assert.throws(()=>parseImportedGeometry("two.geojson",JSON.stringify({type:"FeatureCollection",features:[ft,ft]})),/MULTI_GEOMETRY_UNSUPPORTED/);
assert.throws(()=>parseImportedGeometry("hole.geojson",JSON.stringify({type:"Feature",geometry:{type:"Polygon",coordinates:[...coordinates, coordinates[0]]}})),/POLYGON_HOLES_UNSUPPORTED/);
console.log("Import geometry CRS and integrity QA: ALL PASS");
