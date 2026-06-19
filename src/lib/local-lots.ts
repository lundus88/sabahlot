import type {
  Coordinate,
  PolygonResult,
} from "@/app/components/Map";

import type {
  DrawingObject,
  DrawingObjectCategory,
  DrawingGeometryType,
  DrawingLineStyle,
} from "@/lib/drawing-types";

export const LOCAL_LOTS_STORAGE_KEY =
  "sabahlot_local_lots_v1";

export const LOCAL_LOT_SCHEMA_VERSION = 2;

export type LocalLotSyncStatus =
  | "pending_sync"
  | "local_only"
  | "synced";

export interface LocalLotRecord {
  id: string;
  project_name?: string;
  lot_name: string;
  lot_number: string | null;
  owner_name: string | null;
  village: string | null;
  district: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
  polygon_geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  coordinates: Coordinate[];
  drawing_objects?: DrawingObject[];
  active_object_id?: string | null;
  pdf_identities?: LocalPdfIdentities;
  area_m2: number;
  area_hectare: number;
  area_acre: number;
  perimeter_m: number;
  point_count: number;
  sync_status: LocalLotSyncStatus;
  schemaVersion?: number;
  version: number;
  polygon_fingerprint: string;
}

export interface LocalPdfIdentityPerson {
  name: string;
  idNo: string;
}

export interface LocalPdfIdentities {
  surveyor: LocalPdfIdentityPerson;
  witness: LocalPdfIdentityPerson;
  villageHead: LocalPdfIdentityPerson;
  applicant: LocalPdfIdentityPerson;
}

interface SaveLocalLotInput {
  projectId?: string | null;
  lotName: string;
  lotNumber?: string;
  ownerName?: string;
  village?: string;
  district?: string;
  notes?: string;
  polygon: PolygonResult;
  drawingObjects?: DrawingObject[];
  activeObjectId?: string | null;
  pdfIdentities?: LocalPdfIdentities;
}

function getStorage(): Storage {
  if (typeof window === "undefined") {
    throw new Error(
      "Browser storage is unavailable.",
    );
  }

  return window.localStorage;
}

function createId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `local-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function createFingerprint(
  coordinates: Coordinate[],
): string {
  return coordinates
    .map(
      ({ lat, lng }) =>
        `${lat.toFixed(7)},${lng.toFixed(7)}`,
    )
    .join("|");
}

function createGeoJson(
  coordinates: Coordinate[],
): LocalLotRecord["polygon_geojson"] {
  const ring = coordinates.map(
    ({ lat, lng }) => [lng, lat],
  );

  ring.push([
    coordinates[0].lng,
    coordinates[0].lat,
  ]);

  return {
    type: "Polygon",
    coordinates: [ring],
  };
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function isGeometryType(
  value: unknown,
): value is DrawingGeometryType {
  return (
    value === "polygon" ||
    value === "line"
  );
}

function isLineStyle(
  value: unknown,
): value is DrawingLineStyle {
  return (
    value === "solid" ||
    value === "dashed" ||
    value === "dotted"
  );
}

function isCategory(
  value: unknown,
): value is DrawingObjectCategory {
  return (
    value === "parent_lot" ||
    value === "proposed_lot" ||
    value === "standard_line" ||
    value === "proposed_boundary" ||
    value === "proposed_access" ||
    value === "road_reserve" ||
    value === "setback" ||
    value === "reference_line"
  );
}

function sanitizeCoordinates(
  value: unknown,
): Coordinate[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((coordinate) => {
      if (!isRecord(coordinate)) {
        return null;
      }

      const lat = coordinate.lat;
      const lng = coordinate.lng;

      return typeof lat === "number" &&
        Number.isFinite(lat) &&
        typeof lng === "number" &&
        Number.isFinite(lng)
        ? {
            lat,
            lng,
          }
        : null;
    })
    .filter(
      (
        coordinate,
      ): coordinate is Coordinate =>
        Boolean(coordinate),
    );
}

function sanitizeDrawingObjects(
  value: unknown,
): DrawingObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const ids = new Set<string>();

  return value
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const id = item.id;
      const geometryType =
        item.geometryType;
      const name = item.name;
      const category =
        item.category;
      const coordinates =
        sanitizeCoordinates(
          item.coordinates,
        );

      if (
        typeof id !== "string" ||
        ids.has(id) ||
        !isGeometryType(
          geometryType,
        ) ||
        typeof name !== "string" ||
        !isCategory(category) ||
        coordinates.length === 0
      ) {
        return null;
      }

      ids.add(id);

      const base = {
        id,
        geometryType,
        name,
        category,
        coordinates,
        lineStyle: isLineStyle(
          item.lineStyle,
        )
          ? item.lineStyle
          : geometryType === "line"
            ? "solid"
            : "solid",
        color:
          typeof item.color ===
          "string"
            ? item.color
            : "#16a34a",
        weight:
          typeof item.weight ===
            "number" &&
          Number.isFinite(
            item.weight,
          )
            ? item.weight
            : 3,
        isVisible:
          typeof item.isVisible ===
          "boolean"
            ? item.isVisible
            : true,
        createdAt:
          typeof item.createdAt ===
          "string"
            ? item.createdAt
            : new Date().toISOString(),
        updatedAt:
          typeof item.updatedAt ===
          "string"
            ? item.updatedAt
            : new Date().toISOString(),
      };

      if (geometryType === "polygon") {
        return {
          ...base,
          geometryType,
          areaSqm:
            typeof item.areaSqm ===
              "number" &&
            Number.isFinite(
              item.areaSqm,
            )
              ? item.areaSqm
              : 0,
          areaHa:
            typeof item.areaHa ===
              "number" &&
            Number.isFinite(
              item.areaHa,
            )
              ? item.areaHa
              : 0,
          areaAcre:
            typeof item.areaAcre ===
              "number" &&
            Number.isFinite(
              item.areaAcre,
            )
              ? item.areaAcre
              : 0,
          perimeterM:
            typeof item.perimeterM ===
              "number" &&
            Number.isFinite(
              item.perimeterM,
            )
              ? item.perimeterM
              : 0,
        } satisfies DrawingObject;
      }

      return {
        ...base,
        geometryType,
        lengthM:
          typeof item.lengthM ===
            "number" &&
          Number.isFinite(
            item.lengthM,
          )
            ? item.lengthM
            : 0,
        startBearing:
          typeof item.startBearing ===
            "number" &&
          Number.isFinite(
            item.startBearing,
          )
            ? item.startBearing
            : null,
        endBearing:
          typeof item.endBearing ===
            "number" &&
          Number.isFinite(
            item.endBearing,
          )
            ? item.endBearing
            : null,
      } satisfies DrawingObject;
    })
    .filter(
      (
        object,
      ): object is DrawingObject =>
        Boolean(object),
    );
}

function sanitizePdfIdentities(
  value: unknown,
): LocalPdfIdentities | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const normalizePerson = (
    person: unknown,
  ): LocalPdfIdentityPerson => {
    if (typeof person === "string") {
      return {
        name: "",
        idNo: person,
      };
    }

    if (!isRecord(person)) {
      return {
        name: "",
        idNo: "",
      };
    }

    return {
      name:
        typeof person.name === "string"
          ? person.name
          : "",
      idNo:
        typeof person.idNo === "string"
          ? person.idNo
          : "",
    };
  };

  return {
    surveyor:
      normalizePerson(value.surveyor),
    witness:
      normalizePerson(value.witness),
    villageHead:
      normalizePerson(value.villageHead),
    applicant:
      normalizePerson(value.applicant),
  };
}

function sanitizeLocalLotRecord(
  value: unknown,
): LocalLotRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const coordinates =
    sanitizeCoordinates(
      value.coordinates,
    );

  if (
    typeof value.id !== "string" ||
    typeof value.lot_name !==
      "string" ||
    coordinates.length < 3
  ) {
    return null;
  }

  return {
    id: value.id,
    project_name:
      typeof value.project_name ===
      "string"
        ? value.project_name
        : value.lot_name,
    lot_name: value.lot_name,
    lot_number:
      typeof value.lot_number ===
      "string"
        ? value.lot_number
        : null,
    owner_name:
      typeof value.owner_name ===
      "string"
        ? value.owner_name
        : null,
    village:
      typeof value.village ===
      "string"
        ? value.village
        : null,
    district:
      typeof value.district ===
      "string"
        ? value.district
        : null,
    notes:
      typeof value.notes === "string"
        ? value.notes
        : null,
    created_at:
      typeof value.created_at ===
      "string"
        ? value.created_at
        : new Date().toISOString(),
    updated_at:
      typeof value.updated_at ===
      "string"
        ? value.updated_at
        : new Date().toISOString(),
    polygon_geojson: createGeoJson(
      coordinates,
    ),
    coordinates,
    drawing_objects:
      sanitizeDrawingObjects(
        value.drawing_objects,
      ),
    active_object_id:
      typeof value.active_object_id ===
      "string"
        ? value.active_object_id
        : null,
    pdf_identities:
      sanitizePdfIdentities(
        value.pdf_identities,
      ),
    area_m2:
      typeof value.area_m2 ===
        "number" &&
      Number.isFinite(value.area_m2)
        ? value.area_m2
        : 0,
    area_hectare:
      typeof value.area_hectare ===
        "number" &&
      Number.isFinite(
        value.area_hectare,
      )
        ? value.area_hectare
        : 0,
    area_acre:
      typeof value.area_acre ===
        "number" &&
      Number.isFinite(
        value.area_acre,
      )
        ? value.area_acre
        : 0,
    perimeter_m:
      typeof value.perimeter_m ===
        "number" &&
      Number.isFinite(
        value.perimeter_m,
      )
        ? value.perimeter_m
        : 0,
    point_count:
      typeof value.point_count ===
        "number" &&
      Number.isFinite(
        value.point_count,
      )
        ? value.point_count
        : coordinates.length,
    sync_status:
      value.sync_status === "synced" ||
      value.sync_status ===
        "local_only"
        ? value.sync_status
        : "pending_sync",
    schemaVersion:
      typeof value.schemaVersion ===
        "number" &&
      Number.isFinite(
        value.schemaVersion,
      )
        ? value.schemaVersion
        : 1,
    version:
      typeof value.version ===
        "number" &&
      Number.isFinite(value.version)
        ? value.version
        : 1,
    polygon_fingerprint:
      typeof value.polygon_fingerprint ===
      "string"
        ? value.polygon_fingerprint
        : createFingerprint(
            coordinates,
          ),
  };
}

export function getLocalLots(): LocalLotRecord[] {
  const stored =
    getStorage().getItem(
      LOCAL_LOTS_STORAGE_KEY,
    );

  if (!stored) {
    return [];
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(stored) as unknown;
  } catch {
    console.warn(
      "SabahLot local lot storage is invalid JSON.",
    );
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn(
      "Local lot storage is invalid.",
    );
    return [];
  }

  return parsed
    .map(sanitizeLocalLotRecord)
    .filter(
      (
        record,
      ): record is LocalLotRecord =>
        Boolean(record),
    );
}

function writeLocalLots(
  records: LocalLotRecord[],
): void {
  getStorage().setItem(
    LOCAL_LOTS_STORAGE_KEY,
    JSON.stringify(records),
  );
}

export function saveLocalLot(
  input: SaveLocalLotInput,
): LocalLotRecord {
  const records = getLocalLots();
  const now = new Date().toISOString();
  const fingerprint = createFingerprint(
    input.polygon.coordinates,
  );
  const existingIndex =
    input.projectId
      ? records.findIndex(
          (record) =>
            record.id ===
            input.projectId,
        )
      : -1;
  const existing =
    existingIndex >= 0
      ? records[existingIndex]
      : undefined;
  const drawingObjects =
    sanitizeDrawingObjects(
      input.drawingObjects,
    );

  const record: LocalLotRecord = {
    id:
      input.projectId ??
      existing?.id ??
      createId(),
    project_name: input.lotName,
    lot_name: input.lotName,
    lot_number:
      input.lotNumber?.trim() || null,
    owner_name:
      input.ownerName?.trim() || null,
    village: input.village?.trim() || null,
    district:
      input.district?.trim() || null,
    notes: input.notes?.trim() || null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    polygon_geojson: createGeoJson(
      input.polygon.coordinates,
    ),
    coordinates: input.polygon.coordinates,
    drawing_objects:
      drawingObjects,
    active_object_id:
      input.activeObjectId &&
      drawingObjects.some(
        (object) =>
          object.id ===
          input.activeObjectId,
      )
        ? input.activeObjectId
        : drawingObjects[0]?.id ?? null,
    pdf_identities:
      sanitizePdfIdentities(
        input.pdfIdentities,
      ) ??
      existing?.pdf_identities,
    area_m2: input.polygon.areaM2,
    area_hectare: input.polygon.areaHa,
    area_acre: input.polygon.areaAcre,
    perimeter_m: input.polygon.perimeterM,
    point_count:
      input.polygon.coordinates.length,
    sync_status:
      existing?.sync_status === "synced"
        ? "synced"
        : "pending_sync",
    schemaVersion:
      LOCAL_LOT_SCHEMA_VERSION,
    version: (existing?.version ?? 0) + 1,
    polygon_fingerprint: fingerprint,
  };

  if (existingIndex >= 0) {
    records[existingIndex] = record;
  } else {
    records.unshift(record);
  }

  writeLocalLots(records);
  return record;
}

export function markLocalLotSynced(
  lotId: string,
): LocalLotRecord[] {
  const records = getLocalLots().map(
    (record) =>
      record.id === lotId
        ? {
            ...record,
            sync_status: "synced" as const,
            updated_at: new Date().toISOString(),
          }
        : record,
  );

  writeLocalLots(records);
  return records;
}

export function deleteLocalLot(
  lotId: string,
): LocalLotRecord[] {
  const records = getLocalLots();
  const nextRecords = records.filter(
    (record) => record.id !== lotId,
  );

  if (nextRecords.length === records.length) {
    return records;
  }

  writeLocalLots(nextRecords);
  return nextRecords;
}
