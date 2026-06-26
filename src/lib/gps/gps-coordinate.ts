import proj4 from "proj4";

import type {
  GpsCoordinateFormat,
  ProjectedCoordinate,
  SabahProjection,
} from "./gps-types";

proj4.defs(
  "WGS84",
  "+proj=longlat +datum=WGS84 +no_defs +type=crs",
);

proj4.defs(
  "TIMBALAI_1948_RSO_BORNEO_M",
  "+proj=omerc +lat_0=4 +lonc=115 +alpha=53.3158204722222 " +
    "+gamma=53.1301023611111 +k=0.99984 +x_0=590476.87 " +
    "+y_0=442857.65 +ellps=evrstSS +towgs84=-679,669,-48,0,0,0,0 " +
    "+units=m +no_defs +type=crs",
);

function getProjectionName(projection: SabahProjection) {
  if (projection === "TIMBALAI_1948_RSO_BORNEO_M") {
    return "TIMBALAI_1948_RSO_BORNEO_M";
  }

  return "WGS84";
}

export function convertWgs84ToProjection(
  lat: number,
  lng: number,
  target: SabahProjection,
): ProjectedCoordinate {
  if (target === "WGS84") {
    return {
      lat,
      lng,
      source: "WGS84",
      target: "WGS84",
    };
  }

  const [easting, northing] = proj4(
    "WGS84",
    getProjectionName(target),
    [lng, lat],
  );

  return {
    lat,
    lng,
    easting,
    northing,
    source: "WGS84",
    target,
  };
}

export function parseManualCoordinate(
  value: string,
  format: GpsCoordinateFormat,
): { lat: number; lng: number } {
  if (format === "DD") {
    return parseDd(value);
  }

  if (format === "DDM") {
    return parseDdm(value);
  }

  return parseDms(value);
}

function parseDd(value: string) {
  const parts = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    throw new Error("Format DD tidak sah. Contoh: 5.9804, 116.0735");
  }

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Koordinat DD mesti nombor.");
  }

  return {
    lat,
    lng,
  };
}

function parseDdm(value: string) {
  const match = value.match(
    /(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*([NS])[, ]+\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*([EW])/i,
  );

  if (!match) {
    throw new Error("Format DDM tidak sah. Contoh: 5 58.824 N, 116 04.410 E");
  }

  let lat = Number(match[1]) + Number(match[2]) / 60;
  let lng = Number(match[4]) + Number(match[5]) / 60;

  if (match[3].toUpperCase() === "S") lat *= -1;
  if (match[6].toUpperCase() === "W") lng *= -1;

  return {
    lat,
    lng,
  };
}

function parseDms(value: string) {
  const match = value.match(
    /(\d+)[°\s]+(\d+)[’'\s]+(\d+(?:\.\d+)?)["\s]*([NS])[, ]+\s*(\d+)[°\s]+(\d+)[’'\s]+(\d+(?:\.\d+)?)["\s]*([EW])/i,
  );

  if (!match) {
    throw new Error("Format DMS tidak sah. Contoh: 5 58 49.4 N, 116 04 24.6 E");
  }

  let lat =
    Number(match[1]) +
    Number(match[2]) / 60 +
    Number(match[3]) / 3600;

  let lng =
    Number(match[5]) +
    Number(match[6]) / 60 +
    Number(match[7]) / 3600;

  if (match[4].toUpperCase() === "S") lat *= -1;
  if (match[8].toUpperCase() === "W") lng *= -1;

  return {
    lat,
    lng,
  };
}
