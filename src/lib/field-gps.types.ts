import type {
  PolygonResult,
} from "@/app/components/Map";

export type GpsQualityGrade =
  | "A"
  | "B"
  | "C"
  | "D";

export type FieldGpsCaptureMethod =
  | "single"
  | "averaged"
  | "best-fix";

export interface FieldGpsPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitude?: number | null;
  altitudeAccuracyMeters?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
  source: "phone-gps";
  qualityGrade: GpsQualityGrade;
  sampleCount: number;
  captureMethod: FieldGpsCaptureMethod;
  occupationSeconds: number;
  note?: string;
}

export interface FieldGpsReading {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
  altitude?: number | null;
  altitudeAccuracyMeters?: number | null;
  heading?: number | null;
  speed?: number | null;
  timestamp: string;
}

export interface FieldGpsTrackPoint
  extends FieldGpsReading {
  id: string;
}

export interface FieldGpsPolygon {
  result: PolygonResult;
  generatedAt: string;
}
