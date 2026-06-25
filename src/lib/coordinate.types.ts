export interface ParsedCoordinate {
  latitude: number;
  longitude: number;
  coordinateSystem: "WGS84";
  warnings: string[];
}

export interface CoordinateParseResult {
  ok: boolean;
  coordinate?: ParsedCoordinate;
  error?: string;
}
