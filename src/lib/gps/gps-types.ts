export type GpsCoordinateFormat = "DD" | "DDM" | "DMS";

export type SabahProjection =
  | "WGS84"
  | "TIMBALAI_1948_RSO_BORNEO_M";

export interface GpsPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  elevation?: number;
  source: "GPX" | "KML" | "CSV" | "MANUAL" | "DEVICE";
  type: "waypoint" | "trackpoint" | "manual";
}

export interface GpsTrack {
  id: string;
  name: string;
  points: GpsPoint[];
  source: "GPX" | "KML" | "CSV";
}

export interface ParsedGpsFile {
  waypoints: GpsPoint[];
  tracks: GpsTrack[];
  warnings: string[];
}

export interface ProjectedCoordinate {
  lat: number;
  lng: number;
  easting?: number;
  northing?: number;
  source: SabahProjection;
  target: SabahProjection;
}
