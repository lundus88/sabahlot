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
  ¶»§q«^