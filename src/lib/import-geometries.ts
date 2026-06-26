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
}

export interface ImportDisplayOptions {
  distanceUnit: DistanceUnit;
  areaUnit: AreaUnit;
  language: AppLanguage;
  baseMap: BaseMapId;
}

const EARTH_RADIUS_METERS = 6378137;
const SQM_TO_SQFT = 10.7639104167;
const SQM_PER_ACRE = 4046.8564224;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_LINK = 0.201168;
const METERS_PER_CHAIN = 20.1168;
const MIN_SEGMENT_METERS = 0.5;

const DEFAULT_IMPORT_OPTIONS: ImportDisplayOptions = {
  distanceUnit: "m",
  areaUnit: "m2",
  language: "en",
  baseMap: "hybridOpenSource",
};

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function calculateDistance(start: Coordinate, end: Coordinate): number {
  const latitude1 = degreesToRadians(start.lat);
  const latitude2 = degreesToRadians(end.lat);
  const latitudeDifference = degreesToRadians(end.lat - start.lat);
  const longitudeDifference = degreesToRadians(end.lng - start.lng);

  const haversine =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2;

  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function calculateBearing(start: Coordinate, end: Coordinate): number {
  const latitude1 = degreesToRadians(start.lat);
  const latitude2 = degreesToRadians(end.lat);
  const longitudeDifference = degreesToRadians(end.lng - start.lng);
  const y = Math.sin(longitudeDifference) * Math.cos(latitude2);
  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDifference);

  return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
}

function bearingToDms(value: number): string {
  const degrees = Math.floor(value);
  const minutesFloat = (value - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = (minutesFloat - minutes) * 60;

  return `${degrees}° ${minutes}' ${seconds.toFixed(1)}"`;
}

function sameCoordinate(first: Coordinate, second: Coordinate): boolean {
  return (
    calculateDistance(first, second) <
    MIN_SEGMENT_METERS
  );
}

function sanitizeCoordinates(coordinates: Coordinate[]): Coordinate[] {
  const cleaned: Coordinate[] = [];

  coordinates.forEach((coordinate) => {
    if (
      !Number.isFinite(coordinate.lat) ||
      !Number.isFinite(coordinate.lng) ||
      Math.abs(coordinate.lat) > 90 ||
      Math.abs(coordinate.lng) > 180
    ) {
      return;
    }

    const previous = cleaned[cleaned.length - 1];

    if (!previous || !sameCoordinate(previous, coordinate)) {
      cleaned.push(coordinate);
    }
  });

  if (
    cleaned.length >= 2 &&
    sameCoordinate(cleaned[0], cleaned[cleaned.length - 1])
  ) {
    cleaned.pop();
  }

  return cleaned;
}

function calculatePolygonArea(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) {
    return 0;
  }

  let area = 0;

  coordinates.forEach((current, index) => {
    const next = coordinates[(index + 1) % coordinates.length];
    const latitude1 = degreesToRadians(current.lat);
    const latitude2 = degreesToRadians(next.lat);
    const longitudeDifference = degreesToRadians(next.lng - current.lng);

    area +=
      longitudeDifference *
      (2 + Math.sin(latitude1) + Math.sin(latitude2));
  });

  return Math.abs((area * EARTH_RADIUS_METERS ** 2) / 2);
}

function calculatePerimeter(coordinates: Coordinate[]): number {
  if (coordinates.length < 3) {
    return 0;
  }

  return coordinates.reduce((total, coordinate, index) => {
    const next = coordinates[(index + 1) % coordinates.length];
    const distance = calculateDistance(coordinate, next);

    return distance >= MIN_SEGMENT_METERS
      ? total + distance
      : total;
  }, 0);
}

function createSegments(coordinates: Coordinate[]): PolygonSegment[] {
  if (coordinates.length < 3) {
    return [];
  }

  return coordinates.map((start, index) => {
    const end = coordinates[(index + 1) % coordinates.length];
    const distanceM = calculateDistance(start, end);
    const bearingDecimal = calculateBearing(start, end);

    return {
      segmentNumber: index + 1,
      startPointNumber: index + 1,
      endPointNumber: ((index + 1) % coordinates.length) + 1,
      startCoordinate: start,
      endCoordinate: end,
      bearingDecimal,
      bearingDms: bearingToDms(bearingDecimal),
      distanceM,
      distanceKm: distanceM / 1000,
      distanceFt: distanceM / METERS_PER_FOOT,
      distanceLink: distanceM / METERS_PER_LINK,
      distanceChain: distanceM / METERS_PER_CHAIN,
    };
  });
}

export function createImportedPolygonResult(
  coordinates: Coordinate[],
  options: Partial<ImportDisplayOptions> = {},
): PolygonResult {
  const displayOptions = {
    ...DEFAULT_IMPORT_OPTIONS,
    ...options,
  };
  const cleaned = sanitizeCoordinates(coordinates);
  const areaM2 = calculatePolygonArea(cleaned);
  const perimeterM = calculatePerimeter(cleaned);

  return {
    coordinates: cleaned,
    segments: createSegments(cleaned),
    areaM2,
    areaSqFt: areaM2 * SQM_TO_SQFT,
    areaHa: areaM2 / 10000,
    areaAcre: areaM2 / SQM_PER_ACRE,
    perimeterM,
    perimeterKm: perimeterM / 1000,
    perimeterFt: perimeterM / METERS_PER_FOOT,
    perimeterLink: perimeterM / METERS_PER_LINK,
    perimeterChain: perimeterM / METERS_PER_CHAIN,
    displayDistanceUnit: displayOptions.distanceUnit,
    displayAreaUnit: displayOptions.areaUnit,
    displayLanguage: displayOptions.language,
    displayBaseMap: displayOptions.baseMap,
  };
}

function parseKmlCoordinateText(value: string): Coordinate[] {
  return sanitizeCoordinates(
    value
      .trim()
      .split(/\s+/)
      .map((tuple) => {
        const [lngText, latText] = tuple.split(",");
        const lat = Number(latText);
        const lng = Number(lngText);

        return {
          lat,
          lng,
        };
      }),
  );
}

function textFromFirstElement(
  parent: Element | Document,
  tagName: string,
): string {
  return parent.getElementsByTagName(tagName)[0]?.textContent?.trim() ?? "";
}

function parseKml(
  source: string,
  fileName: string,
  options: Partial<ImportDisplayOptions>,
): ImportedGeometryPreview {
  const parser = new DOMParser();
  const document = parser.parseFromString(source, "application/xml");

  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("KML is not valid XML.");
  }

  const placemarks = Array.from(document.getElementsByTagName("Placemark"));
  const searchRoots = placemarks.length > 0 ? placemarks : [document];

  for (const root of searchRoots) {
    const polygonCoordinates = Array.from(
      root.getElementsByTagName("Polygon"),
    )
      .map((polygon) => textFromFirstElement(polygon, "coordinates"))
      .find(Boolean);

    if (polygonCoordinates) {
      const coordinates = parseKmlCoordinateText(polygonCoordinates);

      if (coordinates.length < 3) {
        throw new Error("KML polygon needs at least 3 valid coordinates.");
      }

      const name = textFromFirstElement(root, "name") || fileName;

      return {
        kind: "polygon",
        format: "KML",
        name,
        coordinates,
        polygon: createImportedPolygonResult(coordinates, options),
        pointCount: coordinates.length,
        message: "Geometry preview ready.",
      };
    }
  }

  throw new Error("No Placemark polygon found in this KML file.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function coordinatesFromGeoJsonPosition(value: unknown): Coordinate | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }

  const lng = Number(value[0]);
  const lat = Number(value[1]);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return null;
  }

  return {
    lat,
    lng,
  };
}

function firstGeoJsonGeometry(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error("GeoJSON root must be an object.");
  }

  if (value.type === "FeatureCollection") {
    const features = Array.isArray(value.features) ? value.features : [];
    const feature = features.find(isRecord);

    if (!feature || !isRecord(feature.geometry)) {
      throw new Error("GeoJSON FeatureCollection has no geometry.");
    }

    return feature.geometry;
  }

  if (value.type === "Feature") {
    if (!isRecord(value.geometry)) {
      throw new Error("GeoJSON Feature has no geometry.");
    }

    return value.geometry;
  }

  return value;
}

function parseGeoJson(
  source: string,
  fileName: string,
  options: Partial<ImportDisplayOptions>,
): ImportedGeometryPreview {
  let parsed: unknown;

  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new Error("GeoJSON is not valid JSON.");
  }

  const geometry = firstGeoJsonGeometry(parsed);

  if (geometry.type === "Polygon") {
    const rings = Array.isArray(geometry.coordinates)
      ? geometry.coordinates
      : [];
    const outerRing = Array.isArray(rings[0]) ? rings[0] : [];
    const coordinates = sanitizeCoordinates(
      outerRing
        .map(coordinatesFromGeoJsonPosition)
        .filter((coordinate): coordinate is Coordinate => Boolean(coordinate)),
    );

    if (coordinates.length < 3) {
      throw new Error("GeoJSON polygon needs at least 3 valid coordinates.");
    }

    return {
      kind: "polygon",
      format: "GeoJSON",
      name: fileName,
      coordinates,
      polygon: createImportedPolygonResult(coordinates, options),
      pointCount: coordinates.length,
      message: "Geometry preview ready.",
    };
  }

  if (geometry.type === "LineString") {
    const coordinates = sanitizeCoordinates(
      (Array.isArray(geometry.coordinates) ? geometry.coordinates : [])
        .map(coordinatesFromGeoJsonPosition)
        .filter((coordinate): coordinate is Coordinate => Boolean(coordinate)),
    );

    if (coordinates.length < 2) {
      throw new Error("GeoJSON line needs at least 2 valid coordinates.");
    }

    return {
      kind: "line",
      format: "GeoJSON",
      name: fileName,
      coordinates,
      polygon: null,
      pointCount: coordinates.length,
      message: "LineString preview ready. Saving currently requires a polygon.",
    };
  }

  if (geometry.type === "Point") {
    const coordinate = coordinatesFromGeoJsonPosition(geometry.coordinates);

    if (!coordinate) {
      throw new Error("GeoJSON point coordinate is invalid.");
    }

    return {
      kind: "point",
      format: "GeoJSON",
      name: fileName,
      coordinates: [coordinate],
      polygon: null,
      pointCount: 1,
      message: "Point preview ready. Saving currently requires a polygon.",
    };
  }

  throw new Error("Only GeoJSON Polygon, LineString and Point are supported.");
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];

    if (character === '"' && quoted && next === '"') {
      current += character;
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(
  source: string,
  fileName: string,
  options: Partial<ImportDisplayOptions>,
): ImportedGeometryPreview {
  const rows = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(splitCsvLine);

  if (rows.length < 2) {
    throw new Error("CSV needs a header and at least 3 coordinate rows.");
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const latIndex = headers.findIndex((header) =>
    ["latitude", "lat"].includes(header),
  );
  const lngIndex = headers.findIndex((header) =>
    ["longitude", "lng", "lon"].includes(header),
  );

  if (latIndex < 0 || lngIndex < 0) {
    throw new Error("CSV header must include latitude/longitude or lat/lng.");
  }

  const coordinates = sanitizeCoordinates(
    rows.slice(1).map((row) => ({
      lat: Number(row[latIndex]),
      lng: Number(row[lngIndex]),
    })),
  );

  if (coordinates.length < 3) {
    throw new Error("CSV polygon needs at least 3 valid coordinate rows.");
  }

  return {
    kind: "polygon",
    format: "CSV",
    name: fileName,
    coordinates,
    polygon: createImportedPolygonResult(coordinates, options),
    pointCount: coordinates.length,
    message: "Geometry preview ready.",
  };
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "").trim() || "Imported Geometry";
}

export function parseImportedGeometry(
  fileName: string,
  source: string,
  options: Partial<ImportDisplayOptions> = {},
): ImportedGeometryPreview {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  const name = baseName(fileName);

  if (extension === "kml") {
    return parseKml(source, name, options);
  }

  if (extension === "geojson" || extension === "json") {
    return parseGeoJson(source, name, options);
  }

  if (extension === "csv") {
    return parseCsv(source, name, options);
  }

  if (extension === "dxf") {
    throw new Error(
      "DXF import is deferred for Alpha because safe CAD parsing needs a dedicated parser.",
    );
  }

  throw new Error("Unsupported file type. Use KML, GeoJSON or CSV.");
}

function createImportId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `import-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createImportedDrawingObject(
  preview: ImportedGeometryPreview,
): DrawingObject | null {
  const now = new Date().toISOString();

  if (preview.kind !== "polygon" || !preview.polygon) {
    return null;
  }

  const category: DrawingObjectCategory = "parent_lot";
  const object: PolygonDrawingObject = {
    id: createImportId(),
    geometryType: "polygon",
    name: preview.name || "Imported Geometry",
    category,
    coordinates: preview.polygon.coordinates,
    lineStyle: "solid",
    color: "#2563eb",
    weight: 4,
    isVisible: true,
    createdAt: now,
    updatedAt: now,
    areaSqm: preview.polygon.areaM2,
    areaHa: preview.polygon.areaHa,
    areaAcre: preview.polygon.areaAcre,
    perimeterM: preview.polygon.perimeterM,
  };

  return object;
}
