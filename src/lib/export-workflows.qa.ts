import type { DrawingObject } from "./drawing-types";
import {
  DXF_CRS_NOTICE,
  buildDxfDocument,
  buildKmlDocument,
  type ExportPoint,
} from "./export-workflows";

const now = "2026-06-20T00:00:00.000Z";
const coordinates = [
  { lat: 5.98, lng: 116.07 },
  { lat: 5.98, lng: 116.08 },
  { lat: 5.99, lng: 116.08 },
];
const polygon = (id: string, isVisible: boolean): DrawingObject => ({
  id,
  geometryType: "polygon",
  name: id,
  category: "proposed_lot",
  coordinates,
  lineStyle: "solid",
  color: "#ffff00",
  weight: 3,
  isVisible,
  createdAt: now,
  updatedAt: now,
  areaSqm: 100,
  areaHa: 0.01,
  areaAcre: 0.0247,
  perimeterM: 40,
});
const line = (
  id: string,
  lineStyle: "solid" | "dashed",
  isVisible: boolean,
): DrawingObject => ({
  id,
  geometryType: "line",
  name: id,
  category: lineStyle === "dashed" ? "proposed_boundary" : "standard_line",
  coordinates: coordinates.slice(0, 2),
  lineStyle,
  color: "#ffff00",
  weight: 3,
  isVisible,
  createdAt: now,
  updatedAt: now,
  lengthM: 12.5,
  startBearing: 90,
  endBearing: 270,
});
const point = (id: string, isVisible: boolean): ExportPoint => ({
  id,
  pointCode: id,
  pointName: id,
  category: "boundary_mark",
  coordinate: coordinates[0],
  isVisible,
});

const objects: DrawingObject[] = [
  polygon("polygon-visible", true),
  polygon("polygon-hidden", false),
  line("solid-visible-1", "solid", true),
  line("solid-visible-2", "solid", true),
  line("dashed-visible", "dashed", true),
  line("dashed-hidden", "dashed", false),
];
const points = [
  point("point-visible-1", true),
  point("point-visible-2", true),
  point("point-hidden", false),
];

const kml = buildKmlDocument("QA Lot", objects, points);
const dxf = buildDxfDocument(objects, points);
const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
const occurrences = (value: string, token: string) =>
  value.split(token).length - 1;

assert(kml.visibleCount === 6, "KML visible-object count mismatch");
assert(occurrences(kml.content, "<Placemark>") === 6, "KML Placemark count mismatch");
assert(!kml.content.includes("polygon-hidden"), "KML contains hidden polygon");
assert(!kml.content.includes("dashed-hidden"), "KML contains hidden dashed line");
assert(!kml.content.includes("point-hidden"), "KML contains hidden point");
assert(!kml.content.includes("<Polygon>"), "KML polygon boundary must not have fill geometry");
assert(
  kml.content.includes("116.07,5.98,0 116.08,5.98,0 116.08,5.99,0 116.07,5.98,0"),
  "KML polygon ring is not closed",
);
assert(kml.content.includes("Status</strong>: Preliminary"), "KML preliminary status missing");
assert(kml.content.includes("SabahLot powered by Myukur"), "KML attribution missing");

assert(dxf.visibleCount === 6, "DXF visible-object count mismatch");
assert(!dxf.content.includes("polygon-hidden"), "DXF contains hidden polygon");
assert(!dxf.content.includes("dashed-hidden"), "DXF contains hidden dashed line");
assert(!dxf.content.includes("point-hidden"), "DXF contains hidden point");
assert(dxf.content.includes("8\nLOT_BOUNDARY\n90\n3\n70\n1"), "DXF polygon is not closed");
assert(dxf.content.includes("8\nPROPOSED_BOUNDARY"), "DXF dashed layer missing");
assert(occurrences(dxf.content, "0\nPOINT\n8\nPOINT\n") === 2, "DXF point count mismatch");
assert(dxf.content.includes(DXF_CRS_NOTICE), "DXF CRS notice missing");
assert(dxf.content.includes("Preliminary Field Assist output only"), "DXF preliminary note missing");

console.log("Export workflow QA: PASS");
