import type {
  AppLanguage,
  AreaUnit,
  BaseMapId,
  Coordinate,
  DistanceUnit,
  PolygonResult,
  PolygonSegment,
} from "@/app/components/Map";

import type {
  DrawingObject,
  DrawingObjectCategory,
  PolygonDrawingObject,
} from "@/lib/drawing-types";

import {
  assessImportCrs,
  assertImportCrsSafe,
  type CrsSafetyDecision,
} from "./crs-datum-safety";
import {
  classifyEvidence,
  type EvidenceDecision,
} from "./evidence-confidence";

export type ImportGeometryKind =
  | "polygon"
  | "line"
  | "point";

export type ImportFileStatus =
  | "no_file"
  | "file_loaded"
  | "preview_ready"
  | "failed"
  | "unsupported";

export interface ImportedGeometryPreview {
  kind: ImportGeometryKind;
  format: "KML" | "GeoJSON" | "CSV";
  name: string;
  coordinates: Coordinate[];
  polygon: PolygonResult | null;
  pointCount: number;
  message: string;
  crs: CrsSafetyDecision;
  evidence: EvidenceDecision;
}

export interface ImportDisplayOptions {
  distanceUnit: DistanceUnit;
  areaUnit: AreaUnit;
  language: AppLanguage;
  baseMap: BaseMapId;
  sourceCrs?: string | null;
}

const EARTH_RADIUS_METERS = 6378137;
const SQM_TO_SQFT = 10.7639104167;
const SQM_PER_ACRE = 4046.8564224;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_LINK = 0.201168;
const METERS_PER_CHAIN = 20.1168;
const MIN_SEGMENT_METERS = 0.5;

function importEvidence(
  format: "KML" | "GeoJSON" | "CSV",
  crs: CrsSafetyDecision,
): EvidenceDecision {
  const source =
    format === "KML"
      ? "kml¶»§q«^