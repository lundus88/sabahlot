import type {
  Coordinate,
  PolygonResult,
} from "@/app/components/Map";

export const LOCAL_LOTS_STORAGE_KEY =
  "sabahlot_local_lots_v1";

export type LocalLotSyncStatus =
  | "pending_sync"
  | "local_only"
  | "synced";

export interface LocalLotRecord {
  id: string;
  lot_name: string;
  lot_number: string | null;
  owner_name: string | null;
  village: string | null;
  district: string | null;
  created_at: string;
  updated_at: string;
  polygon_geojson: {
    type: "Polygon";
    coordinates: number[][][];
  };
  coordinates: Coordinate[];
  area_m2: number;
  area_hectare: number;
  area_acre: number;
  perimeter_m: number;
  point_count: number;
  sync_status: LocalLotSyncStatus;
  version: number;
  polygon_fingerprint: string;
}

interface SaveLocalLotInput {
  lotName: string;
  lotNumber?: string;
  ownerName?: string;
  village?: string;
  district?: string;
  polygon: PolygonResult;
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

export function getLocalLots(): LocalLotRecord[] {
  const stored =
    getStorage().getItem(
      LOCAL_LOTS_STORAGE_KEY,
    );

  if (!stored) {
    return [];
  }

  const parsed = JSON.parse(stored) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(
      "Local lot storage is invalid.",
    );
  }

  return parsed as LocalLotRecord[];
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
  const existingIndex = records.findIndex(
    (record) =>
      record.lot_name === input.lotName &&
      record.polygon_fingerprint ===
        fingerprint,
  );
  const existing =
    existingIndex >= 0
      ? records[existingIndex]
      : undefined;

  const record: LocalLotRecord = {
    id: existing?.id ?? createId(),
    lot_name: input.lotName,
    lot_number:
      input.lotNumber?.trim() || null,
    owner_name:
      input.ownerName?.trim() || null,
    village: input.village?.trim() || null,
    district:
      input.district?.trim() || null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    polygon_geojson: createGeoJson(
      input.polygon.coordinates,
    ),
    coordinates: input.polygon.coordinates,
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
