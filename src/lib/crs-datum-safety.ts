export type SupportedImportCrs =
  | "EPSG:4326"
  | "EPSG:29873"
  | "GDM2000_BORNEO_RSO"
  | "UTM_UNSPECIFIED"
  | "UNKNOWN";

export type CrsSafetyStatus =
  | "VERIFIED_NATIVE"
  | "TRANSFORM_REQUIRED"
  | "CRS_UNCONFIRMED";

export interface CrsSafetyDecision {
  sourceCrs: SupportedImportCrs;
  targetCrs: "EPSG:4326";
  status: CrsSafetyStatus;
  transformationApplied: false;
  evidence: string;
}

const TARGET_CRS = "EPSG:4326" as const;

export function normalizeDeclaredImportCrs(value: unknown): SupportedImportCrs {
  if (typeof value !== "string") return "UNKNOWN";
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "_");

  if (["EPSG:4326", "WGS84", "WGS_84"].includes(normalized)) return "EPSG:4326";
  if (["EPSG:29873", "BRSO_TIMBALAI", "BORNEO_RSO_TIMBALAI"].includes(normalized)) {
    return "EPSG:29873";
  }
  if (["GDM2000_BORNEO_RSO", "GDM2000_BRSO"].includes(normalized)) {
    return "GDM2000_BORNEO_RSO";
  }
  if (["UTM", "UTM_UNSPECIFIED"].includes(normalized)) return "UTM_UNSPECIFIED";
  return "UNKNOWN";
}

export function assessImportCrs(
  format: "KML" | "GeoJSON" | "CSV",
  declaredCrs?: string | null,
): CrsSafetyDecision {
  if (format === "KML") {
    return {
      sourceCrs: "EPSG:4326",
      targetCrs: TARGET_CRS,
      status: "VERIFIED_NATIVE",
      transformationApplied: false,
      evidence: "KML coordinates are consumed under the KML geographic WGS84 longitude/latitude contract.",
    };
  }

  if (format === "GeoJSON") {
    return {
      sourceCrs: "EPSG:4326",
      targetCrs: TARGET_CRS,
      status: "VERIFIED_NATIVE",
      transformationApplied: false,
      evidence: "GeoJSON is consumed under the RFC 7946 WGS84 longitude/latitude contract.",
    };
  }

  const sourceCrs = normalizeDeclaredImportCrs(declaredCrs);
  if (sourceCrs === "EPSG:4326") {
    return {
      sourceCrs,
      targetCrs: TARGET_CRS,
      status: "VERIFIED_NATIVE",
      transformationApplied: false,
      evidence: "CSV source CRS was explicitly declared as WGS84 / EPSG:4326.",
    };
  }

  if (sourceCrs === "UNKNOWN") {
    return {
      sourceCrs,
      targetCrs: TARGET_CRS,
      status: "CRS_UNCONFIRMED",
      transformationApplied: false,
      evidence: "CSV has no verified source CRS declaration.",
    };
  }

  return {
    sourceCrs,
    targetCrs: TARGET_CRS,
    status: "TRANSFORM_REQUIRED",
    transformationApplied: false,
    evidence: "Source CRS is recognized but no verified transformation is enabled in CRS Safety Engine P0.",
  };
}

export function assertImportCrsSafe(decision: CrsSafetyDecision): void {
  if (decision.status === "VERIFIED_NATIVE") return;

  if (decision.status === "CRS_UNCONFIRMED") {
    throw new Error(
      "CRS_UNCONFIRMED: declare and verify the CSV coordinate reference system before preview or use.",
    );
  }

  throw new Error(
    `TRANSFORM_REQUIRED: ${decision.sourceCrs} is recognized, but SabahLot P0 will not transform it silently. Use verified WGS84/EPSG:4326 input or wait for an approved transformation engine.`,
  );
}
