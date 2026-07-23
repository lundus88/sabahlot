// Must run before importing field-target-import.ts: parseKmlTargets()
// checks `typeof DOMParser` at call time, and Node has no DOMParser
// global on its own. jsdom is an existing devDependency; only its
// DOMParser is installed here, nothing else on globalThis.
import { JSDOM } from "jsdom";
import Module from "node:module";
import path from "node:path";

const dom = new JSDOM("<!doctype html><html><body></body></html>");
(globalThis as unknown as { DOMParser: typeof DOMParser }).DOMParser =
  dom.window.DOMParser as unknown as typeof DOMParser;

// field-target-import.ts imports its one dependency via the "@/..."
// tsconfig path alias, which Next.js's bundler resolves at build time
// but plain `tsc` (used to compile this QA script) does not rewrite in
// the emitted `require()` calls. This QA-only shim maps "@/x" back to
// the compiled output directory so plain `node` can run it.
type ResolveFilename = (
  this: unknown,
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
) => string;
const moduleWithInternals = Module as unknown as {
  _resolveFilename: ResolveFilename;
};
const originalResolveFilename =
  moduleWithInternals._resolveFilename;
const compiledRoot = path.resolve(__dirname, "..");
moduleWithInternals._resolveFilename = function patchedResolveFilename(
  this: unknown,
  request: string,
  ...rest: [unknown, boolean, unknown?]
) {
  const rewritten = request.startsWith("@/")
    ? path.join(compiledRoot, request.slice(2))
    : request;
  return originalResolveFilename.call(
    this,
    rewritten,
    ...rest,
  );
} as ResolveFilename;

import {
  parseCsvTargets,
  parseDxfTargets,
  parseFieldTargetFile,
  parseKmlTargets,
} from "./field-target-import";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

// --- CSV -------------------------------------------------------------

const csvValid = parseCsvTargets(
  [
    "name,latitude,longitude",
    "Point A,5.9800000,116.0700000",
    "Point B,5.9900000,116.0800000",
  ].join("\n"),
);

assert(csvValid.importedCount === 2, "CSV valid: importedCount mismatch");
assert(csvValid.skippedCount === 0, "CSV valid: skippedCount mismatch");
assert(csvValid.points[0].name === "Point A", "CSV valid: first point name mismatch");
assert(csvValid.points[0].latitude === 5.98, "CSV valid: first point latitude mismatch");
assert(csvValid.points[0].longitude === 116.07, "CSV valid: first point longitude mismatch");
assert(csvValid.points[1].name === "Point B", "CSV valid: second point name mismatch");

const csvMisnamedHeaders = parseCsvTargets(
  [
    "foo,bar,baz",
    "1,2,3",
    "4,5,6",
  ].join("\n"),
);

assert(
  csvMisnamedHeaders.points.length === 0,
  "CSV misnamed headers: should import zero points",
);
assert(
  csvMisnamedHeaders.skippedCount === 2,
  "CSV misnamed headers: skippedCount should equal data row count",
);
assert(
  !!csvMisnamedHeaders.warning &&
    !csvMisnamedHeaders.warning.includes("coordinate system"),
  "CSV misnamed headers: should warn about unrecognized header, not coordinate system",
);

const csvEastingNorthing = parseCsvTargets(
  [
    "name,easting,northing",
    "Point A,500000,650000",
  ].join("\n"),
);

assert(
  csvEastingNorthing.points.length === 0,
  "CSV easting/northing: should import zero points",
);
assert(
  csvEastingNorthing.skippedCount === 1,
  "CSV easting/northing: skippedCount should equal data row count",
);
assert(
  !!csvEastingNorthing.warning &&
    csvEastingNorthing.warning.includes("Unsupported coordinate system"),
  "CSV easting/northing: must be rejected with the unsupported-coordinate-system message, not silently misread as WGS84",
);

const csvEmpty = parseCsvTargets("");
assert(csvEmpty.points.length === 0, "CSV empty: should import zero points");
assert(
  !!csvEmpty.warning && csvEmpty.warning.includes("empty"),
  "CSV empty: should warn that the file is empty",
);

// --- KML ---------------------------------------------------------------

const kmlPoint = parseKmlTargets(
  `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Test Point</name>
      <Point>
        <coordinates>116.073456,5.980412,0</coordinates>
      </Point>
    </Placemark>
    <Placemark>
      <Point>
        <coordinates>116.08,5.99,0</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`,
);

assert(kmlPoint.importedCount === 2, "KML Point: importedCount mismatch");
assert(kmlPoint.points[0].name === "Test Point", "KML Point: name should come from <name>");
assert(kmlPoint.points[0].latitude === 5.980412, "KML Point: latitude mismatch (lon,lat order)");
assert(kmlPoint.points[0].longitude === 116.073456, "KML Point: longitude mismatch (lon,lat order)");
assert(
  kmlPoint.points[1].name === "Placemark",
  "KML Point: missing <name> should fall back to 'Placemark'",
);

const kmlPolygon = parseKmlTargets(
  `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>Lot A</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              116.07,5.98,0 116.08,5.98,0 116.08,5.99,0 116.07,5.98,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`,
);

assert(
  kmlPolygon.importedCount === 3,
  "KML Polygon: closing duplicate ring vertex should be dropped (4 raw vertices -> 3 points)",
);
assert(
  kmlPolygon.points[0].name === "Lot A V001" &&
    kmlPolygon.points[1].name === "Lot A V002" &&
    kmlPolygon.points[2].name === "Lot A V003",
  "KML Polygon: vertices should auto-name as '<placemark> V00N'",
);
assert(
  kmlPolygon.points.some(
    (point) => point.latitude === 5.98 && point.longitude === 116.07,
  ),
  "KML Polygon: first ring vertex should still be present",
);

const kmlInvalid = parseKmlTargets("<kml><Document><Unclosed></Document></kml>");
assert(
  Array.isArray(kmlInvalid.points),
  "KML invalid: should not throw and should return a points array",
);

// --- DXF -----------------------------------------------------------------

const dxfPoint = parseDxfTargets(
  [
    "0", "POINT",
    "8", "LAYER1",
    "10", "116.073456",
    "20", "5.980412",
    "0", "ENDSEC",
  ].join("\n"),
);

assert(dxfPoint.importedCount === 1, "DXF POINT: importedCount mismatch");
assert(dxfPoint.points[0].name === "DXF Point 1", "DXF POINT: auto-name mismatch");
assert(dxfPoint.points[0].latitude === 5.980412, "DXF POINT: latitude mismatch");
assert(dxfPoint.points[0].longitude === 116.073456, "DXF POINT: longitude mismatch");

const dxfLwpolyline = parseDxfTargets(
  [
    "0", "LWPOLYLINE",
    "8", "BOUNDARY",
    "10", "116.07",
    "20", "5.98",
    "10", "116.08",
    "20", "5.98",
    "10", "116.08",
    "20", "5.99",
    "0", "ENDSEC",
  ].join("\n"),
);

assert(dxfLwpolyline.importedCount === 3, "DXF LWPOLYLINE: importedCount mismatch");
assert(
  dxfLwpolyline.points[0].name === "BOUNDARY V001" &&
    dxfLwpolyline.points[1].name === "BOUNDARY V002" &&
    dxfLwpolyline.points[2].name === "BOUNDARY V003",
  "DXF LWPOLYLINE: vertices should auto-name using the layer as label",
);

const dxfPolylineVertex = parseDxfTargets(
  [
    "0", "POLYLINE",
    "8", "BOUNDARY2",
    "0", "VERTEX",
    "10", "116.10",
    "20", "6.00",
    "0", "VERTEX",
    "10", "116.11",
    "20", "6.01",
    "0", "SEQEND",
    "0", "ENDSEC",
  ].join("\n"),
);

assert(
  dxfPolylineVertex.importedCount === 2,
  "DXF POLYLINE/VERTEX: importedCount mismatch",
);
assert(
  dxfPolylineVertex.points[0].name === "BOUNDARY2 V001" &&
    dxfPolylineVertex.points[1].name === "BOUNDARY2 V002",
  "DXF POLYLINE/VERTEX: vertices should auto-name using the polyline layer",
);

const dxfOutOfRange = parseDxfTargets(
  [
    "0", "POINT",
    "8", "0",
    "10", "500.0",
    "20", "5.98",
    "0", "ENDSEC",
  ].join("\n"),
);

assert(
  dxfOutOfRange.points.length === 0,
  "DXF out-of-range: invalid coordinate must be skipped, not imported",
);
assert(
  dxfOutOfRange.skippedCount === 1,
  "DXF out-of-range: skippedCount mismatch",
);
assert(
  !!dxfOutOfRange.warning &&
    dxfOutOfRange.warning.includes("coordinate system is not confirmed"),
  "DXF out-of-range: must surface the coordinate-system-not-confirmed warning, not silently drop the point",
);

const dxfEmpty = parseDxfTargets("");
assert(dxfEmpty.points.length === 0, "DXF empty: should import zero points");
assert(
  !!dxfEmpty.warning && dxfEmpty.warning.includes("Unable to read DXF file"),
  "DXF empty: should warn that the file is unreadable",
);

// --- Dispatch / unsupported input ----------------------------------------

const unsupportedExtension = parseFieldTargetFile("notes.txt", "hello world");
assert(
  unsupportedExtension.points.length === 0,
  "Unsupported extension: should import zero points",
);
assert(
  !!unsupportedExtension.warning &&
    unsupportedExtension.warning.includes("Unsupported file type"),
  "Unsupported extension: should warn about unsupported file type",
);

const routedCsv = parseFieldTargetFile(
  "targets.CSV",
  "name,latitude,longitude\nA,5.98,116.07",
);
assert(
  routedCsv.importedCount === 1,
  "parseFieldTargetFile: should route .CSV (case-insensitive) to the CSV parser",
);

console.log("Field target import QA: PASS");
