import type {
  AreaUnit,
  AppLanguage,
  BaseMapId,
  DistanceUnit,
  PolygonResult,
} from "@/app/components/Map";

import type {
  FieldGpsCaptureMethod,
  FieldGpsPoint,
  FieldGpsReading,
} from "./field-gps.types";

import {
  getGpsQualityGrade,
} from "./gps-quality";

const EARTH_RADIUS_METERS = 6378137;
const SQM_TO_SQFT = 10.7639104167;
const SQM_PER_ACRE = 4046.8564224;
const METERS_PER_FOOT = 0.3048;
const METERS_PER_LINK = 0.201168;
const METERS_PER_CHAIN = 20.1168;

export const FIELD_GPS_DISCLAIMER =
  "GPS phone position is approximate and for preliminary field reference only. It is not a cadastral boundary confirmation or official survey result.";

export const KEYED_COORDINATE_DISCLAIMER =
  "Keyed coordinates are user-entered and have not been independently verified by SabahLot. They are for preliminary field reference only and must not be treated as legal boundary evidence.";

export const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

function toRadians(
  value: number,
): number {
  return (
    value *
    Math.PI
  ) / 180;
}

function toDegrees(
  value: number,
): number {
  return (
    value *
    180
  ) / Math.PI;
}

export function createFieldGpsId(): string {
  if (
    typeof crypto !== "undefined" &&
    "randomUUID" in crypto
  ) {
    return crypto.randomUUID();
  }

  return `field-gps-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export function readingFromPosition(
  position: GeolocationPosition,
): FieldGpsReading {
  return {
    latitude:
      position.coords.latitude,
    longitude:
      position.coords.longitude,
    accuracyMeters:
      position.coords.accuracy,
    altitude:
      position.coords.altitude,
    altitudeAccuracyMeters:
      position.coords.altitudeAccuracy,
    heading:
      position.coords.heading,
    speed:
      position.coords.speed,
    timestamp:
      new Date(
        position.timestamp,
      ).toISOString(),
  };
}

export function createFieldGpsPoint(
  reading: FieldGpsReading,
  label: string,
  captureMethod: FieldGpsCaptureMethod,
  sampleCount: number,
  occupationSeconds: number,
  note?: string,
): FieldGpsPoint {
  return {
    id:
      createFieldGpsId(),
    label,
    latitude:
      reading.latitude,
    longitude:
      reading.longitude,
    accuracyMeters:
      reading.accuracyMeters,
    altitude:
      reading.altitude ?? null,
    altitudeAccuracyMeters:
      reading.altitudeAccuracyMeters ?? null,
    heading:
      reading.heading ?? null,
    speed:
      reading.speed ?? null,
    timestamp:
      reading.timestamp,
    source:
      "phone-gps",
    qualityGrade:
      getGpsQualityGrade(
        reading.accuracyMeters,
      ),
    sampleCount,
    captureMethod,
    occupationSeconds,
    note,
  };
}

export function createKeyedCoordinatePoint(
  latitude: number,
  longitude: number,
  label: string,
  note?: string,
): FieldGpsPoint {
  return {
    id:
      createFieldGpsId(),
    label,
    latitude,
    longitude,
    timestamp:
      new Date().toISOString(),
    source:
      "keyed-coordinate",
    qualityGrade:
      "D",
    sampleCount:
      1,
    captureMethod:
      "manual-key-in",
    occupationSeconds:
      0,
    note:
      note?.trim()
        ? `${note.trim()} Keyed WGS84 latitude/longitude; preliminary approximate field reference only.`
        : "Keyed WGS84 latitude/longitude; preliminary approximate field reference only.",
  };
}

export function averageReadings(
  readings: FieldGpsReading[],
): {
  reading: FieldGpsReading | null;
  acceptedCount: number;
  rejectedCount: number;
  bestAccuracy?: number;
} {
  const accepted =
    readings.filter(
      (reading) =>
        typeof reading.accuracyMeters !==
          "number" ||
        reading.accuracyMeters <= 50,
    );

  if (
    accepted.length ===
    0
  ) {
    return {
      reading: null,
      acceptedCount: 0,
      rejectedCount:
        readings.length,
    };
  }

  const bestAccuracy =
    Math.min(
      ...accepted.map(
        (reading) =>
          reading.accuracyMeters ??
          Number.POSITIVE_INFINITY,
      ),
    );

  const average = (
    key: keyof Pick<
      FieldGpsReading,
      "latitude" | "longitude"
    >,
  ) =>
    accepted.reduce(
      (
        total,
        reading,
      ) =>
        total +
        reading[key],
      0,
    ) / accepted.length;

  const averageAccuracy =
    accepted.reduce(
      (
        total,
        reading,
      ) =>
        total +
        (reading.accuracyMeters ?? 50),
      0,
    ) / accepted.length;

  return {
    reading: {
      ...accepted[
        accepted.length - 1
      ],
      latitude:
        average("latitude"),
      longitude:
        average("longitude"),
      accuracyMeters:
        averageAccuracy,
      timestamp:
        new Date().toISOString(),
    },
    acceptedCount:
      accepted.length,
    rejectedCount:
      readings.length -
      accepted.length,
    bestAccuracy:
      Number.isFinite(
        bestAccuracy,
      )
        ? bestAccuracy
        : undefined,
  };
}

export function bestFixReading(
  readings: FieldGpsReading[],
): FieldGpsReading | null {
  return (
    readings
      .filter(
        (reading) =>
          typeof reading.accuracyMeters !==
            "number" ||
          reading.accuracyMeters <= 50,
      )
      .sort(
        (left, right) =>
          (left.accuracyMeters ??
            Number.POSITIVE_INFINITY) -
          (right.accuracyMeters ??
            Number.POSITIVE_INFINITY),
      )[0] ?? null
  );
}

export function calculateFieldGpsDistanceMeters(
  start: [number, number],
  end: [number, number],
): number {
  const latitude1 =
    toRadians(start[0]);
  const latitude2 =
    toRadians(end[0]);
  const latitudeDelta =
    toRadians(
      end[0] - start[0],
    );
  const longitudeDelta =
    toRadians(
      end[1] - start[1],
    );
  const haversine =
    Math.sin(
      latitudeDelta / 2,
    ) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(
        longitudeDelta / 2,
      ) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(
        1 - haversine,
      ),
    )
  );
}

function calculateArea(
  points: Array<[number, number]>,
): number {
  let area = 0;

  points.forEach(
    (
      current,
      index,
    ) => {
      const next =
        points[
          (index + 1) %
            points.length
        ];
      area +=
        toRadians(
          next[1] -
            current[1],
        ) *
        (
          2 +
          Math.sin(
            toRadians(
              current[0],
            ),
          ) +
          Math.sin(
            toRadians(
              next[0],
            ),
          )
        );
    },
  );

  return Math.abs(
    (
      area *
      EARTH_RADIUS_METERS ** 2
    ) / 2,
  );
}

export function calculateFieldGpsBearingDegrees(
  start: [number, number],
  end: [number, number],
): number {
  const latitude1 =
    toRadians(start[0]);
  const latitude2 =
    toRadians(end[0]);
  const longitudeDelta =
    toRadians(
      end[1] - start[1],
    );
  const y =
    Math.sin(longitudeDelta) *
    Math.cos(latitude2);
  const x =
    Math.cos(latitude1) *
      Math.sin(latitude2) -
    Math.sin(latitude1) *
      Math.cos(latitude2) *
      Math.cos(longitudeDelta);

  return (
    toDegrees(
      Math.atan2(y, x),
    ) + 360
  ) % 360;
}

export function bearingToDms(
  bearing: number,
): string {
  const degrees =
    Math.floor(bearing);
  const minutesFloat =
    (bearing - degrees) * 60;
  const minutes =
    Math.floor(minutesFloat);
  const seconds =
    Math.round(
      (minutesFloat - minutes) *
        60,
    );

  return `${String(degrees).padStart(3, "0")} deg ${String(minutes).padStart(2, "0")} min ${String(seconds).padStart(2, "0")} sec`;
}

export function createPreliminaryPolygonResult(
  points: FieldGpsPoint[],
  distanceUnit: DistanceUnit = "m",
  areaUnit: AreaUnit = "m2",
  language: AppLanguage = "en",
  baseMap: BaseMapId = "hybridOpenSource",
): PolygonResult | null {
  if (
    points.length <
    3
  ) {
    return null;
  }

  const pairs =
    points.map(
      (point) =>
        [
          point.latitude,
          point.longitude,
        ] as [number, number],
    );
  const areaM2 =
    calculateArea(pairs);
  const perimeterM =
    pairs.reduce(
      (
        total,
        point,
        index,
      ) =>
        total +
        calculateFieldGpsDistanceMeters(
          point,
          pairs[
            (index + 1) %
              pairs.length
          ],
        ),
      0,
    );

  return {
    coordinates:
      points.map(
        (point) => ({
          lat:
            point.latitude,
          lng:
            point.longitude,
        }),
      ),
    segments:
      pairs.map(
        (
          point,
          index,
        ) => {
          const next =
            pairs[
              (index + 1) %
                pairs.length
            ];
          const distanceM =
            calculateFieldGpsDistanceMeters(
              point,
              next,
            );

          return {
            segmentNumber:
              index + 1,
            startPointNumber:
              index + 1,
            endPointNumber:
              ((index + 1) %
                pairs.length) +
              1,
            startCoordinate: {
              lat:
                point[0],
              lng:
                point[1],
            },
            endCoordinate: {
              lat:
                next[0],
              lng:
                next[1],
            },
            bearingDecimal:
              calculateFieldGpsBearingDegrees(
                point,
                next,
              ),
            bearingDms:
              bearingToDms(
                calculateFieldGpsBearingDegrees(
                  point,
                  next,
                ),
              ),
            distanceM,
            distanceKm:
              distanceM / 1000,
            distanceFt:
              distanceM /
              METERS_PER_FOOT,
            distanceLink:
              distanceM /
              METERS_PER_LINK,
            distanceChain:
              distanceM /
              METERS_PER_CHAIN,
          };
        },
      ),
    areaM2,
    areaSqFt:
      areaM2 * SQM_TO_SQFT,
    areaHa:
      areaM2 / 10000,
    areaAcre:
      areaM2 / SQM_PER_ACRE,
    perimeterM,
    perimeterKm:
      perimeterM / 1000,
    perimeterFt:
      perimeterM /
      METERS_PER_FOOT,
    perimeterLink:
      perimeterM /
      METERS_PER_LINK,
    perimeterChain:
      perimeterM /
      METERS_PER_CHAIN,
    displayDistanceUnit:
      distanceUnit,
    displayAreaUnit:
      areaUnit,
    displayLanguage:
      language,
    displayBaseMap:
      baseMap,
  };
}
