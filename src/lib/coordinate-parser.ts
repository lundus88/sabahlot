import type {
  CoordinateParseResult,
  ParsedCoordinate,
} from "./coordinate.types";

const SABAH_BOUNDS = {
  minLatitude: 3,
  maxLatitude: 8.5,
  minLongitude: 113,
  maxLongitude: 120,
};

function decimalNumbers(
  value: string,
): number[] {
  return (
    value
      .match(/[-+]?\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter(Number.isFinite) ?? []
  );
}

function parseDmsValue(
  degrees: string,
  minutes: string | undefined,
  seconds: string | undefined,
  hemisphere: string,
): number {
  const sign =
    /[SW]/i.test(hemisphere)
      ? -1
      : 1;
  return (
    sign *
    (
      Number(degrees) +
      Number(minutes ?? 0) / 60 +
      Number(seconds ?? 0) / 3600
    )
  );
}

function dmsNumbers(
  value: string,
): number[] | null {
  const pattern =
    /(\d+(?:\.\d+)?)\s*(?:°|deg|d)?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|min|m))?\s*(?:(\d+(?:\.\d+)?)\s*(?:"|sec|s))?\s*([NSEW])/gi;
  const matches =
    Array.from(
      value.matchAll(pattern),
    );

  if (
    matches.length < 2
  ) {
    return null;
  }

  const parsed =
    matches.map(
      (match) => ({
        value:
          parseDmsValue(
            match[1],
            match[2],
            match[3],
            match[4],
          ),
        hemisphere:
          match[4].toUpperCase(),
      }),
    );
  const latitude =
    parsed.find((item) =>
      ["N", "S"].includes(
        item.hemisphere,
      ),
    )?.value;
  const longitude =
    parsed.find((item) =>
      ["E", "W"].includes(
        item.hemisphere,
      ),
    )?.value;

  return latitude !== undefined &&
    longitude !== undefined
    ? [latitude, longitude]
    : null;
}

function inRange(
  value: number,
  min: number,
  max: number,
): boolean {
  return (
    value >= min &&
    value <= max
  );
}

function validationWarnings(
  latitude: number,
  longitude: number,
  reversed: boolean,
): string[] {
  const warnings: string[] = [];

  if (reversed) {
    warnings.push(
      "Coordinate order may be reversed. SabahLot expects Latitude, Longitude.",
    );
  }

  if (
    !inRange(
      latitude,
      SABAH_BOUNDS.minLatitude,
      SABAH_BOUNDS.maxLatitude,
    ) ||
    !inRange(
      longitude,
      SABAH_BOUNDS.minLongitude,
      SABAH_BOUNDS.maxLongitude,
    )
  ) {
    warnings.push(
      "Coordinate appears outside the approximate Sabah area. Check before using as preliminary field reference only.",
    );
  }

  return warnings;
}

export function parseWgs84Coordinate(
  input: string,
): CoordinateParseResult {
  const text =
    input.trim();

  if (!text) {
    return {
      ok: false,
      error:
        "Enter a WGS84 latitude, longitude coordinate.",
    };
  }

  const values =
    dmsNumbers(text) ??
    decimalNumbers(text);

  if (
    values.length < 2
  ) {
    return {
      ok: false,
      error:
        "Could not read latitude and longitude. Use WGS84 latitude, longitude.",
    };
  }

  let latitude =
    values[0];
  let longitude =
    values[1];
  let reversed =
    false;

  if (
    !inRange(latitude, -90, 90) &&
    inRange(latitude, -180, 180) &&
    inRange(longitude, -90, 90)
  ) {
    reversed = true;
    latitude = values[1];
    longitude = values[0];
  }

  if (
    !inRange(latitude, -90, 90)
  ) {
    return {
      ok: false,
      error:
        "Latitude must be between -90 and 90.",
    };
  }

  if (
    !inRange(longitude, -180, 180)
  ) {
    return {
      ok: false,
      error:
        "Longitude must be between -180 and 180.",
    };
  }

  const coordinate: ParsedCoordinate = {
    latitude,
    longitude,
    coordinateSystem:
      "WGS84",
    warnings:
      validationWarnings(
        latitude,
        longitude,
        reversed,
      ),
  };

  return {
    ok: true,
    coordinate,
  };
}
