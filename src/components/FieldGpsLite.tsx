"use client";



import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  flushSync,
} from "react-dom";
import {
  useRouter,
} from "next/navigation";

import type {
  PolygonResult,
} from "@/app/components/Map";

import Link from "next/link";

import FeedbackForm from "@/components/feedback/FeedbackForm";
import BugReportButton from "@/components/feedback/BugReportButton";
import FeedbackExportButton from "@/components/feedback/FeedbackExportButton";

import {
  averageReadings,
  bearingToDms,
  bestFixReading,
  calculateFieldGpsBearingDegrees,
  calculateFieldGpsDistanceMeters,
  createFieldGpsId,
  createFieldGpsPoint,
  createPreliminaryPolygonResult,
  FIELD_GPS_DISCLAIMER,
  GEOLOCATION_OPTIONS,
  readingFromPosition,
} from "@/lib/field-gps";

import {
  buildFieldGpsCsv,
  buildFieldGpsKml,
  downloadTextFile,
  exportFieldGpsPdf,
} from "@/lib/field-gps-export";

import type {
  FieldGpsPoint,
  FieldGpsReading,
  FieldGpsTrackPoint,
  GpsQualityGrade,
} from "@/lib/field-gps.types";

import {
  getGpsQualityGrade,
} from "@/lib/gps-quality";
import {
  readGpsTargetMemory,
  saveGpsTargetMemory,
} from "@/utils/gpsTargetMemory";

import FieldGpsAccuracyPanel from "./FieldGpsAccuracyPanel";

interface FieldGpsLiteProps {
  enabled: boolean;
  recordName?: string;
  offlineMapNote?: string;
  onPolygonGenerated?: (
    polygon: PolygonResult,
  ) => void;
}

type CaptureMode =
  | "best-fix"
  | "averaged";

type TargetSource =
  | "current-position"
  | "manual"
  | "saved-point";

type FoundPointMode =
  | "Phone GPS"
  | "AR Find Point Lite";

type CameraStatus =
  | "Starting"
  | "Active"
  | "Permission denied"
  | "Not supported"
  | "Failed to start"
  | "Stopped";

type CameraMode =
  | "environment"
  | "fallback"
  | "front"
  | "unknown";

interface CameraErrorDetails {
  name: string;
  message: string;
}

type GpsSignalLevel =
  | "strong"
  | "weak"
  | "lost";

interface GpsSignalStatus {
  level: GpsSignalLevel;
  label: string;
  className: string;
}

interface FieldGpsTarget {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  source: TargetSource;
  description?: string;
}

interface FoundPointRecord {
  id: string;
  fieldNoteLabel: "Preliminary Field Assist";
  targetName: string;
  targetLatitude: number;
  targetLongitude: number;
  foundLatitude: number;
  foundLongitude: number;
  distanceDifferenceMeters: number;
  bearingDegrees: number;
  accuracyMeters?: number;
  gpsQualityGrade: GpsQualityGrade;
  gpsSignalLabel: string;
  capturedAt: string;
  timestamp: string;
  note: string;
  mode: FoundPointMode;
}

interface FieldGpsPersistedState {
  schemaVersion: 1;
  points: FieldGpsPoint[];
  foundPoints: FieldGpsPoint[];
  foundPointRecords: FoundPointRecord[];
  trackLog: FieldGpsTrackPoint[];
  targetPoint: FieldGpsTarget | null;
  generatedPolygon: PolygonResult | null;
  savedAt: string;
}

const OCCUPATION_OPTIONS = [
  10,
  20,
  30,
  60,
];

const FIELD_NAVIGATION_SAFETY_LABEL =
  "Preliminary Field Assist: approximate field navigation support only.";

const PRELIMINARY_FIELD_ASSIST_LABEL =
  "Preliminary Field Assist";

const FIELD_GPS_STORAGE_KEY =
  "sabahlot:field-gps-lite:v1";

const MOBILE_AR_VIDEO_ATTRIBUTES = {
  "webkit-playsinline": "true",
} as const;

function nextLabel(
  points: FieldGpsPoint[],
): string {
  return `P${points.length + 1}`;
}

function nextFoundLabel(
  points: FieldGpsPoint[],
): string {
  return `F${points.length + 1}`;
}

function formatAccuracy(
  accuracy?: number,
): string {
  return accuracy === undefined
    ? "not measured"
    : `${accuracy.toFixed(1)} m`;
}

function formatCoordinate(
  value: number,
): string {
  return value.toFixed(7);
}

function formatDistance(
  meters: number,
): string {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(3)} km`
    : `${meters.toFixed(1)} m`;
}

function buildGoogleMapsUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function buildWazeUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
}

function formatTimestamp(
  value?: string,
): string {
  return value ?? "-";
}

function getGpsSignalStatus(
  position: FieldGpsReading | null,
  gpsStatus: string,
  error: string,
  lastUpdateMs: number,
): GpsSignalStatus {
  const lostLabel =
    "GPS Lost - No location connection";
  const weakLabel =
    "GPS Weak - Weak signal";
  const strongLabel =
    "GPS Active - Strong signal";

  const statusText =
    `${gpsStatus} ${error}`.toLowerCase();
  const hasLostStatus =
    statusText.includes("denied") ||
    statusText.includes("unavailable") ||
    statusText.includes("not supported") ||
    statusText.includes("timeout") ||
    statusText.includes("stopped");

  const buildStatus = (
    level: GpsSignalLevel,
    baseLabel: string,
  ) => {
    const accuracyLabel =
      position?.accuracyMeters !==
      undefined
        ? ` - +/-${position.accuracyMeters.toFixed(
            1,
          )} m`
        : "";

    return {
      level,
      label: `${baseLabel}${accuracyLabel}`,
      className: `sl-gps-signal sl-gps-signal-${level}`,
    };
  };

  if (
    !position ||
    hasLostStatus
  ) {
    return buildStatus(
      "lost",
      lostLabel,
    );
  }

  const positionTime =
    Date.parse(position.timestamp);

  if (!Number.isFinite(positionTime)) {
    return buildStatus(
      "lost",
      lostLabel,
    );
  }

  const ageSeconds =
    Math.max(
      0,
      (lastUpdateMs - positionTime) /
        1000,
    );
  const accuracy =
    position.accuracyMeters;

  if (
    accuracy === undefined ||
    accuracy > 30 ||
    ageSeconds > 30
  ) {
    return buildStatus(
      "lost",
      lostLabel,
    );
  }

  if (
    accuracy > 10 ||
    ageSeconds >= 15
  ) {
    return buildStatus(
      "weak",
      weakLabel,
    );
  }

  return buildStatus(
    "strong",
    strongLabel,
  );
}
function getArrowRotationDegrees(
  bearingDegrees?: number,
  headingDegrees?: number | null,
): number {
  if (
    bearingDegrees === undefined ||
    !Number.isFinite(bearingDegrees)
  ) {
    return 0;
  }

  if (
    typeof headingDegrees === "number" &&
    Number.isFinite(headingDegrees)
  ) {
    return (
      bearingDegrees -
      headingDegrees +
      360
    ) % 360;
  }

  return bearingDegrees;
}

function getTargetZoneStatus(
  distanceMeters: number,
): string {
  if (distanceMeters < 2) {
    return "At target zone";
  }

  if (distanceMeters <= 5) {
    return "Near target";
  }

  if (distanceMeters <= 20) {
    return "Approaching target";
  }

  return "Far from target";
}

function getCameraErrorDetails(
  error: unknown,
): CameraErrorDetails {
  if (error instanceof DOMException) {
    return {
      name:
        error.name || "DOMException",
      message:
        error.message || "-",
    };
  }

  if (error instanceof Error) {
    return {
      name:
        error.name || "Error",
      message:
        error.message || "-",
    };
  }

  return {
    name: "UnknownError",
    message: "-",
  };
}

function getCameraSupportSnapshot() {
  const secureContext =
    typeof window !== "undefined" &&
    window.isSecureContext;
  const mediaDevicesSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices);
  const getUserMediaSupported =
    typeof navigator !== "undefined" &&
    Boolean(
      navigator.mediaDevices
        ?.getUserMedia,
    );

  return {
    secureContext,
    mediaDevicesSupported,
    getUserMediaSupported,
  };
}

function parseCoordinateInput(
  value: string,
  minimum: number,
  maximum: number,
): number | null {
  const coordinate =
    Number(value.trim());

  if (
    !Number.isFinite(coordinate) ||
    coordinate < minimum ||
    coordinate > maximum
  ) {
    return null;
  }

  return coordinate;
}

function isValidLatLng(
  latitude: number,
  longitude: number,
) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
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

function stringValue(
  value: unknown,
  fallback = "",
): string {
  return typeof value === "string"
    ? value
    : fallback;
}

function optionalNumber(
  value: unknown,
): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : undefined;
}

function nullableNumber(
  value: unknown,
): number | null | undefined {
  if (value === null) {
    return null;
  }

  return optionalNumber(value);
}

function sanitizeQualityGrade(
  value: unknown,
): GpsQualityGrade {
  return value === "A" ||
    value === "B" ||
    value === "C" ||
    value === "D"
    ? value
    : "D";
}

function sanitizeFieldGpsPoint(
  value: unknown,
): FieldGpsPoint | null {
  if (!isRecord(value)) {
    return null;
  }

  const latitude =
    optionalNumber(value.latitude);
  const longitude =
    optionalNumber(value.longitude);

  if (
    latitude === undefined ||
    longitude === undefined ||
    !isValidLatLng(latitude, longitude)
  ) {
    return null;
  }

  return {
    id:
      stringValue(value.id) ||
      createFieldGpsId(),
    label:
      stringValue(value.label, "Point"),
    latitude,
    longitude,
    accuracyMeters:
      optionalNumber(value.accuracyMeters),
    altitude:
      nullableNumber(value.altitude),
    altitudeAccuracyMeters:
      nullableNumber(
        value.altitudeAccuracyMeters,
      ),
    heading:
      nullableNumber(value.heading),
    speed:
      nullableNumber(value.speed),
    timestamp:
      stringValue(
        value.timestamp,
        new Date().toISOString(),
      ),
    source:
      value.source === "keyed-coordinate"
        ? "keyed-coordinate"
        : "phone-gps",
    qualityGrade:
      sanitizeQualityGrade(
        value.qualityGrade,
      ),
    sampleCount:
      optionalNumber(value.sampleCount) ??
      1,
    captureMethod:
      value.captureMethod ===
        "manual-key-in" ||
      value.captureMethod === "single" ||
      value.captureMethod === "best-fix" ||
      value.captureMethod === "averaged"
        ? value.captureMethod
        : "single",
    occupationSeconds:
      optionalNumber(
        value.occupationSeconds,
      ) ?? 0,
    note:
      stringValue(value.note) ||
      undefined,
  };
}

function sanitizeTrackPoint(
  value: unknown,
): FieldGpsTrackPoint | null {
  const point =
    sanitizeFieldGpsPoint(value);

  if (!point) {
    return null;
  }

  return {
    id:
      point.id,
    latitude:
      point.latitude,
    longitude:
      point.longitude,
    accuracyMeters:
      point.accuracyMeters,
    altitude:
      point.altitude,
    altitudeAccuracyMeters:
      point.altitudeAccuracyMeters,
    heading:
      point.heading,
    speed:
      point.speed,
    timestamp:
      point.timestamp,
  };
}

function sanitizeTargetPoint(
  value: unknown,
): FieldGpsTarget | null {
  if (!isRecord(value)) {
    return null;
  }

  const latitude =
    optionalNumber(value.latitude);
  const longitude =
    optionalNumber(value.longitude);

  if (
    latitude === undefined ||
    longitude === undefined ||
    !isValidLatLng(latitude, longitude)
  ) {
    return null;
  }

  return {
    id:
      stringValue(value.id) ||
      createFieldGpsId(),
    label:
      stringValue(
        value.label,
        "Target Point",
      ),
    latitude,
    longitude,
    source:
      value.source ===
        "current-position" ||
      value.source === "manual" ||
      value.source === "saved-point"
        ? value.source
        : "manual",
    description:
      stringValue(value.description) ||
      undefined,
  };
}

function sanitizeFoundPointRecord(
  value: unknown,
): FoundPointRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const targetLatitude =
    optionalNumber(value.targetLatitude);
  const targetLongitude =
    optionalNumber(value.targetLongitude);
  const foundLatitude =
    optionalNumber(value.foundLatitude);
  const foundLongitude =
    optionalNumber(value.foundLongitude);
  const distanceDifferenceMeters =
    optionalNumber(
      value.distanceDifferenceMeters,
    );
  const bearingDegrees =
    optionalNumber(value.bearingDegrees);

  if (
    targetLatitude === undefined ||
    targetLongitude === undefined ||
    foundLatitude === undefined ||
    foundLongitude === undefined ||
    distanceDifferenceMeters === undefined ||
    bearingDegrees === undefined ||
    !isValidLatLng(
      targetLatitude,
      targetLongitude,
    ) ||
    !isValidLatLng(
      foundLatitude,
      foundLongitude,
    )
  ) {
    return null;
  }

  const timestamp =
    stringValue(
      value.timestamp,
      stringValue(
        value.capturedAt,
        new Date().toISOString(),
      ),
    );

  return {
    id:
      stringValue(value.id) ||
      createFieldGpsId(),
    fieldNoteLabel:
      PRELIMINARY_FIELD_ASSIST_LABEL,
    targetName:
      stringValue(
        value.targetName,
        "Target Point",
      ),
    targetLatitude,
    targetLongitude,
    foundLatitude,
    foundLongitude,
    distanceDifferenceMeters,
    bearingDegrees,
    accuracyMeters:
      optionalNumber(value.accuracyMeters),
    gpsQualityGrade:
      sanitizeQualityGrade(
        value.gpsQualityGrade,
      ),
    gpsSignalLabel:
      stringValue(
        value.gpsSignalLabel,
        "GPS not recorded",
      ),
    capturedAt:
      stringValue(value.capturedAt, timestamp),
    timestamp,
    note:
      stringValue(value.note),
    mode:
      value.mode === "AR Find Point Lite"
        ? "AR Find Point Lite"
        : "Phone GPS",
  };
}

function readPersistedFieldGpsState():
  | FieldGpsPersistedState
  | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        FIELD_GPS_STORAGE_KEY,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    return {
      schemaVersion: 1,
      points: Array.isArray(parsed.points)
        ? parsed.points
            .map(sanitizeFieldGpsPoint)
            .filter(
              (
                point,
              ): point is FieldGpsPoint =>
                Boolean(point),
            )
        : [],
      foundPoints: Array.isArray(
        parsed.foundPoints,
      )
        ? parsed.foundPoints
            .map(sanitizeFieldGpsPoint)
            .filter(
              (
                point,
              ): point is FieldGpsPoint =>
                Boolean(point),
            )
        : [],
      foundPointRecords: Array.isArray(
        parsed.foundPointRecords,
      )
        ? parsed.foundPointRecords
            .map(sanitizeFoundPointRecord)
            .filter(
              (
                record,
              ): record is FoundPointRecord =>
                Boolean(record),
            )
        : [],
      trackLog: Array.isArray(parsed.trackLog)
        ? parsed.trackLog
            .map(sanitizeTrackPoint)
            .filter(
              (
                point,
              ): point is FieldGpsTrackPoint =>
                Boolean(point),
            )
        : [],
      targetPoint:
        sanitizeTargetPoint(
          parsed.targetPoint,
        ),
      generatedPolygon:
        isRecord(parsed.generatedPolygon)
          ? (parsed.generatedPolygon as unknown as PolygonResult)
          : null,
      savedAt:
        stringValue(
          parsed.savedAt,
          new Date().toISOString(),
        ),
    };
  } catch {
    return null;
  }
}

export default function FieldGpsLite({
  enabled,
  recordName,
  offlineMapNote,
  onPolygonGenerated,
}: FieldGpsLiteProps) {
  const router = useRouter();
  const [
    open,
    setOpen,
  ] = useState(false);
  const [
    status,
    setStatus,
  ] = useState(
    "GPS not started",
  );
  const [
    lastGpsError,
    setLastGpsError,
  ] = useState("");
  const [
    gpsNowMs,
    setGpsNowMs,
  ] = useState(() => Date.now());
  const [
    gpsActive,
    setGpsActive,
  ] = useState(false);
  const [
    reading,
    setReading,
  ] = useState<FieldGpsReading | null>(
    null,
  );
  const [
    points,
    setPoints,
  ] = useState<FieldGpsPoint[]>([]);
  const [
    renamingPointId,
    setRenamingPointId,
  ] = useState<string | null>(null);
  const [
    renameDraft,
    setRenameDraft,
  ] = useState("");
  const [
    trackLog,
    setTrackLog,
  ] = useState<FieldGpsTrackPoint[]>(
    [],
  );
  const [
    foundPoints,
    setFoundPoints,
  ] = useState<FieldGpsPoint[]>([]);
  const [
    foundPointRecords,
    setFoundPointRecords,
  ] = useState<FoundPointRecord[]>([]);
  const [
    targetPoint,
    setTargetPoint,
  ] = useState<FieldGpsTarget | null>(
    null,
  );
  const [
    targetLabelInput,
    setTargetLabelInput,
  ] = useState("Target Point");
  const [
    targetLatitudeInput,
    setTargetLatitudeInput,
  ] = useState("");
  const [
    targetLongitudeInput,
    setTargetLongitudeInput,
  ] = useState("");
  const [
    targetDescriptionInput,
    setTargetDescriptionInput,
  ] = useState("");
  const [
    targetValidationError,
    setTargetValidationError,
  ] = useState("");
  const [
    tracking,
    setTracking,
  ] = useState(false);
  const [
    navigationActive,
    setNavigationActive,
  ] = useState(false);
  const [
    arActive,
    setArActive,
  ] = useState(false);
  const [
    arMessage,
    setArMessage,
  ] = useState("");
  const [
    cameraStatus,
    setCameraStatus,
  ] = useState<CameraStatus>(
    "Stopped",
  );
  const [
    cameraMode,
    setCameraMode,
  ] = useState<CameraMode>(
    "unknown",
  );
  const [
    cameraSecureContext,
    setCameraSecureContext,
  ] = useState(false);
  const [
    mediaDevicesSupported,
    setMediaDevicesSupported,
  ] = useState(false);
  const [
    getUserMediaSupported,
    setGetUserMediaSupported,
  ] = useState(false);
  const [
    cameraErrorName,
    setCameraErrorName,
  ] = useState("");
  const [
    cameraErrorMessage,
    setCameraErrorMessage,
  ] = useState("");
  const [
    cameraTestActive,
    setCameraTestActive,
  ] = useState(false);
  const [
    foundPointNoteInput,
    setFoundPointNoteInput,
  ] = useState("");
  const [
    gateMeters,
    setGateMeters,
  ] = useState<number | null>(10);
  const [
    allowApproximate,
    setAllowApproximate,
  ] = useState(false);
  const [
    occupationSeconds,
    setOccupationSeconds,
  ] = useState(10);
  const [
    captureMessage,
    setCaptureMessage,
  ] = useState("");
  const [
    captureBusy,
    setCaptureBusy,
  ] = useState<CaptureMode | null>(null);
  const [
    generatedPolygon,
    setGeneratedPolygon,
  ] = useState<PolygonResult | null>(
    null,
  );

  const watchRef =
    useRef<number | null>(null);
  const trackRef =
    useRef(false);
  const readingRef =
    useRef<FieldGpsReading | null>(
      null,
    );
  const videoRef =
    useRef<HTMLVideoElement | null>(
      null,
    );
  const cameraStreamRef =
    useRef<MediaStream | null>(
      null,
    );
  const restoredGpsTargetMemoryRef =
    useRef<string | null>(null);
  const fieldGpsRestoredRef =
    useRef(false);

  const stopCameraStream =
    useCallback(() => {
      if (cameraStreamRef.current) {
        cameraStreamRef.current
          .getTracks()
          .forEach((track) =>
            track.stop(),
          );
        cameraStreamRef.current = null;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraStatus("Stopped");
    }, []);

  const playCameraStream =
    useCallback(
      async (
        stream: MediaStream,
      ): Promise<boolean> => {
        const video = videoRef.current;

        if (!video) {
          return false;
        }

        video.muted = true;
        video.playsInline = true;
        video.setAttribute(
          "playsinline",
          "true",
        );
        video.setAttribute(
          "webkit-playsinline",
          "true",
        );
        video.setAttribute(
          "autoplay",
          "true",
        );
        video.setAttribute(
          "muted",
          "true",
        );

        if (
          "disablePictureInPicture" in
          video
        ) {
          video.disablePictureInPicture =
            true;
        }

        video.srcObject = stream;

        try {
          await new Promise<boolean>(
            (resolve) => {
              if (video.readyState >= 1) {
                resolve(true);
                return;
              }

              const timeoutId =
                window.setTimeout(
                  () => resolve(true),
                  1500,
                );

              video.onloadedmetadata =
                () => {
                  window.clearTimeout(
                    timeoutId,
                  );
                  resolve(true);
                };
            },
          );
          await video.play();
          return true;
        } catch {
          return new Promise((resolve) => {
            let settled = false;

            const finish = (
              value: boolean,
            ) => {
              if (settled) {
                return;
              }
              settled = true;
              video.onloadedmetadata =
                null;
              video.removeEventListener(
                "loadedmetadata",
                handleLoadedMetadata,
              );
              resolve(value);
            };

            const handleLoadedMetadata =
              () => {
                void video
                  .play()
                  .then(() =>
                    finish(true),
                  )
                  .catch(() =>
                    finish(false),
                  );
              };

            video.addEventListener(
              "loadedmetadata",
              handleLoadedMetadata,
              {
                once: true,
              },
            );

            window.setTimeout(
              () => finish(false),
              1500,
            );
          });
        }
      },
      [],
    );

  const qualityGrade =
    useMemo(
      () =>
        getGpsQualityGrade(
          reading?.accuracyMeters,
        ),
      [reading],
    );

  const gpsSignalStatus =
    useMemo(
      () =>
        getGpsSignalStatus(
          reading,
          status,
          lastGpsError,
          gpsNowMs,
        ),
      [
        gpsNowMs,
        lastGpsError,
        reading,
        status,
      ],
    );

  const accuracyBlocked =
    Boolean(
      gateMeters !== null &&
        reading?.accuracyMeters !== undefined &&
        reading.accuracyMeters >
          gateMeters &&
        !allowApproximate,
    );

  const allRecordedPoints =
    useMemo(
      () => [
        ...points,
        ...foundPoints,
      ],
      [
        points,
        foundPoints,
      ],
    );

  const targetNavigation =
    useMemo(() => {
      if (
        !reading ||
        !targetPoint
      ) {
        return null;
      }

      const start: [number, number] =
        [
          reading.latitude,
          reading.longitude,
        ];
      const end: [number, number] =
        [
          targetPoint.latitude,
          targetPoint.longitude,
        ];
      const bearingDegrees =
        calculateFieldGpsBearingDegrees(
          start,
          end,
        );

      return {
        distanceMeters:
          calculateFieldGpsDistanceMeters(
            start,
            end,
          ),
        bearingDegrees,
        bearingDms:
          bearingToDms(
            bearingDegrees,
          ),
      };
    }, [
      reading,
      targetPoint,
    ]);

  const directionArrowDegrees =
    getArrowRotationDegrees(
      targetNavigation?.bearingDegrees,
      reading?.heading,
    );

  const restoreTargetToFieldGps =
    useCallback(
      (target: {
        latitude: number;
        longitude: number;
        label?: string;
        description?: string;
        source?: "key-in" | "map" | "ar";
        savedAt?: string;
      }) => {
        const latitude =
          Number(target.latitude);
        const longitude =
          Number(target.longitude);

        if (
          !isValidLatLng(
            latitude,
            longitude,
          )
        ) {
          return false;
        }

        const label =
          target.label?.trim() ||
          "AR Guide Target";
        const description =
          target.description?.trim() ?? "";
        const source =
          target.source ?? "key-in";

        saveGpsTargetMemory({
          lat:
            latitude,
          lng:
            longitude,
          label,
          source,
          savedAt:
            target.savedAt,
        });
        setTargetPoint({
          id:
            createFieldGpsId(),
          label,
          latitude,
          longitude,
          source:
            "manual",
          description,
        });
        setTargetLabelInput(label);
        setTargetLatitudeInput(
          formatCoordinate(latitude),
        );
        setTargetLongitudeInput(
          formatCoordinate(longitude),
        );
        setTargetDescriptionInput(
          description,
        );
        setTargetValidationError("");

        window.dispatchEvent(
          new CustomEvent(
            "sabahlot:find-coordinate",
            {
              detail: {
                latitude,
                longitude,
                label,
                note:
                  description,
                currentLatitude:
                  readingRef.current
                    ?.latitude,
                currentLongitude:
                  readingRef.current
                    ?.longitude,
                currentAccuracy:
                  readingRef.current
                    ?.accuracyMeters,
              },
            },
          ),
        );

        return true;
      },
      [],
    );

  useEffect(() => {
    if (
      !enabled ||
      fieldGpsRestoredRef.current
    ) {
      return;
    }

    const restored =
      readPersistedFieldGpsState();

    if (!restored) {
      fieldGpsRestoredRef.current = true;
      return;
    }

    queueMicrotask(() => {
      setPoints(restored.points);
      setFoundPoints(restored.foundPoints);
      setFoundPointRecords(
        restored.foundPointRecords,
      );
      setTrackLog(restored.trackLog);
      setGeneratedPolygon(
        restored.generatedPolygon,
      );

      if (restored.targetPoint) {
        setTargetPoint(restored.targetPoint);
        setTargetLabelInput(
          restored.targetPoint.label,
        );
        setTargetLatitudeInput(
          formatCoordinate(
            restored.targetPoint.latitude,
          ),
        );
        setTargetLongitudeInput(
          formatCoordinate(
            restored.targetPoint.longitude,
          ),
        );
        setTargetDescriptionInput(
          restored.targetPoint.description ?? "",
        );
      }

      setCaptureMessage(
        `${PRELIMINARY_FIELD_ASSIST_LABEL} data restored from this device.`,
      );

      window.setTimeout(() => {
        fieldGpsRestoredRef.current = true;
      }, 0);
    });
  }, [enabled]);

  useEffect(() => {
    if (
      !enabled ||
      !fieldGpsRestoredRef.current
    ) {
      return;
    }

    try {
      const state: FieldGpsPersistedState = {
        schemaVersion: 1,
        points,
        foundPoints,
        foundPointRecords,
        trackLog,
        targetPoint,
        generatedPolygon,
        savedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(
        FIELD_GPS_STORAGE_KEY,
        JSON.stringify(state),
      );
    } catch {
      // Field capture can continue without local persistence.
    }
  }, [
    enabled,
    foundPointRecords,
    foundPoints,
    generatedPolygon,
    points,
    targetPoint,
    trackLog,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!navigator.geolocation) {
      window.setTimeout(
        () => {
          setLastGpsError(
            "not supported",
          );
          setStatus(
            "Location services are not supported.",
          );
        },
        0,
      );
    }

    return () => {
      if (
        watchRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchRef.current,
        );
        watchRef.current = null;
      }
      setGpsActive(false);
      setTracking(false);
      setNavigationActive(false);
      stopCameraStream();
    };
  }, [
    enabled,
    stopCameraStream,
  ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId =
      window.setInterval(
        () => setGpsNowMs(Date.now()),
        5000,
      );

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled]);

  useEffect(() => {
    if (
      !arActive ||
      !cameraStreamRef.current ||
      !videoRef.current
    ) {
      return;
    }

    let cancelled = false;
    const stream =
      cameraStreamRef.current;

    void playCameraStream(stream).then(
      (started) => {
        if (cancelled) {
          return;
        }

        if (started) {
          setCameraStatus("Active");
          return;
        }

        setCameraStatus(
          "Failed to start",
        );
        setArMessage(
          "Camera stream started but video playback was blocked. Tap Test Camera or Start AR Guide again.",
        );
      },
    );

    return () => {
      cancelled = true;
    };
  }, [
    arActive,
    playCameraStream,
  ]);

  const handleVideoLoadedMetadata =
    useCallback(() => {
      if (
        !arActive ||
        !cameraStreamRef.current
      ) {
        return;
      }

      void playCameraStream(
        cameraStreamRef.current,
      ).then((started) => {
        if (started) {
          setCameraStatus("Active");
        } else {
          setCameraStatus(
            "Failed to start",
          );
          setArMessage(
            "Camera stream started but video playback was blocked. Tap Test Camera or Start AR Guide again.",
          );
        }
      });
    }, [
      arActive,
      playCameraStream,
    ]);

  useEffect(() => {
    trackRef.current = tracking;
  }, [tracking]);

  useEffect(() => {
    const handleKeyedPoint = (
      event: Event,
    ) => {
      const detail =
        (
          event as CustomEvent<{
            point?: FieldGpsPoint;
          }>
        ).detail;

      if (!detail?.point) {
        return;
      }

      setPoints(
        (current) => [
          ...current,
          detail.point!,
        ],
      );
      setCaptureMessage(
        `${detail.point.label} added as keyed WGS84 coordinate. Preliminary approximate field reference only.`,
      );
    };

    window.addEventListener(
      "sabahlot:add-field-gps-point",
      handleKeyedPoint,
    );

    return () => {
      window.removeEventListener(
        "sabahlot:add-field-gps-point",
        handleKeyedPoint,
      );
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timeoutId =
      window.setTimeout(() => {
        const queryParams =
          new URLSearchParams(
            window.location.search,
          );
        const queryLatitudeText =
          queryParams
            .get("targetLat")
            ?.trim() ?? "";
        const queryLongitudeText =
          queryParams
            .get("targetLng")
            ?.trim() ?? "";
        const queryLatitude =
          queryLatitudeText
            ? parseCoordinateInput(
                queryLatitudeText,
                -90,
                90,
              )
            : null;
        const queryLongitude =
          queryLongitudeText
            ? parseCoordinateInput(
                queryLongitudeText,
                -180,
                180,
              )
            : null;
        const queryLabel =
          queryParams
            .get("targetLabel")
            ?.trim() ||
          "AR Guide Target";
        const forceRestore =
          queryParams.get(
            "restoreTarget",
          ) === "1";
        const querySavedAt =
          queryLatitude !== null &&
          queryLongitude !== null
            ? `url:${queryLatitude}:${queryLongitude}:${queryLabel}`
            : "";

        const savedTarget =
          queryLatitude !== null &&
          queryLongitude !== null
            ? {
                lat:
                  queryLatitude,
                lng:
                  queryLongitude,
                label:
                  queryLabel,
                source:
                  "ar" as const,
                savedAt:
                  querySavedAt,
              }
            : readGpsTargetMemory();

        if (
          !savedTarget ||
          (
            !forceRestore &&
            restoredGpsTargetMemoryRef.current ===
              savedTarget.savedAt
          )
        ) {
          return;
        }

        const label =
          savedTarget.label?.trim() ||
          "AR Guide Target";
        const latitude =
          Number(savedTarget.lat);
        const longitude =
          Number(savedTarget.lng);

        restoredGpsTargetMemoryRef.current =
          savedTarget.savedAt;
        restoreTargetToFieldGps({
          latitude,
          longitude,
          label,
          source:
            savedTarget.source,
          savedAt:
            savedTarget.savedAt,
        });
      }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    enabled,
    open,
    restoreTargetToFieldGps,
  ]);

  const stopArGuide = () => {
    stopCameraStream();
    setArActive(false);
    setCameraTestActive(false);
    setArMessage("AR Guide stopped.");
  };

  const closeFieldGpsPanel =
    useCallback(() => {
      if (arActive) {
        stopArGuide();
      }

      setOpen(false);
    }, [
      arActive,
    ]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleClosePanel =
      () => {
        closeFieldGpsPanel();
      };

    window.addEventListener(
      "sabahlot:close-field-gps-panel",
      handleClosePanel,
    );

    return () => {
      window.removeEventListener(
        "sabahlot:close-field-gps-panel",
        handleClosePanel,
      );
    };
  }, [
    closeFieldGpsPanel,
    enabled,
  ]);

  if (!enabled) {
    return null;
  }

  const savePoint = (
    point: FieldGpsPoint,
  ) => {
    setPoints(
      (current) => [
        ...current,
        point,
      ],
    );
    setCaptureMessage(
      `${point.label} saved as preliminary approximate phone GPS field reference only.`,
    );
  };

  const startGps = () => {
    if (!navigator.geolocation) {
      setLastGpsError(
        "not supported",
      );
      setStatus(
        "Location services are not supported.",
      );
      return;
    }

    if (watchRef.current !== null) {
      setStatus("GPS already active");
      return;
    }

    setStatus("Requesting GPS permission");
    setLastGpsError("");

    watchRef.current =
      navigator.geolocation.watchPosition(
        (position) => {
          const nextReading =
            readingFromPosition(
              position,
            );
          readingRef.current =
            nextReading;
          setReading(nextReading);
          setGpsNowMs(Date.now());
          setLastGpsError("");
          setGpsActive(true);
          setStatus(
            nextReading.accuracyMeters !==
              undefined &&
              nextReading.accuracyMeters >
                25
              ? "Accuracy weak"
              : "GPS ready",
          );

          if (trackRef.current) {
            setTrackLog(
              (current) => [
                ...current,
                {
                  ...nextReading,
                  id:
                    createFieldGpsId(),
                },
              ],
            );
          }
        },
        (error) => {
          if (
            watchRef.current !== null
          ) {
            navigator.geolocation.clearWatch(
              watchRef.current,
            );
            watchRef.current = null;
          }
          setGpsActive(false);
          setTracking(false);
          setNavigationActive(false);
          const gpsError =
            error.code ===
            error.PERMISSION_DENIED
              ? "permission denied"
              : error.code ===
                  error.TIMEOUT
                ? "timeout"
                : "unavailable";
          setLastGpsError(gpsError);
          setStatus(
            error.code ===
              error.PERMISSION_DENIED
              ? "GPS permission denied"
              : error.code ===
                  error.TIMEOUT
                ? "GPS timeout"
              : "GPS unavailable",
          );
        },
        GEOLOCATION_OPTIONS,
      );

    setGpsActive(true);
    setStatus("Waiting for GPS fix");
  };

  const stopGps = () => {
    if (
      watchRef.current !== null &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(
        watchRef.current,
      );
      watchRef.current = null;
    }

    setGpsActive(false);
    setTracking(false);
    setNavigationActive(false);
    setLastGpsError("stopped");
    setStatus("GPS stopped");
    setCaptureMessage(
      "GPS stopped. Last reading remains visible for reference.",
    );
  };

  const toggleGps = () => {
    if (gpsActive) {
      stopGps();
    } else {
      startGps();
    }
  };

  const saveTargetMemoryFromTarget = (
    target: FieldGpsTarget,
    source:
      | "key-in"
      | "map"
      | "ar" =
      target.source === "manual"
        ? "key-in"
        : "map",
  ) =>
    saveGpsTargetMemory({
      lat:
        target.latitude,
      lng:
        target.longitude,
      label:
        target.label,
      source,
    });

  const getArTargetFromInputsOrState =
    () => {
      const latitudeText =
        targetLatitudeInput.trim();
      const longitudeText =
        targetLongitudeInput.trim();
      const inputLatitude =
        latitudeText
          ? Number.parseFloat(
              latitudeText,
            )
          : Number.NaN;
      const inputLongitude =
        longitudeText
          ? Number.parseFloat(
              longitudeText,
            )
          : Number.NaN;

      if (
        isValidLatLng(
          inputLatitude,
          inputLongitude,
        )
      ) {
        return {
          latitude:
            inputLatitude,
          longitude:
            inputLongitude,
          label:
            targetLabelInput.trim() ||
            "AR Guide Target",
        };
      }

      if (
        targetPoint &&
        isValidLatLng(
          Number(
            targetPoint.latitude,
          ),
          Number(
            targetPoint.longitude,
          ),
        )
      ) {
        return {
          latitude:
            Number(
              targetPoint.latitude,
            ),
          longitude:
            Number(
              targetPoint.longitude,
            ),
          label:
            targetPoint.label ||
            "AR Guide Target",
        };
      }

      return null;
    };

  const applyArTarget = (
    arTarget: {
      latitude: number;
      longitude: number;
      label: string;
    },
    source: "key-in" | "ar" =
      "key-in",
  ) => {
    return restoreTargetToFieldGps({
      latitude:
        arTarget.latitude,
      longitude:
        arTarget.longitude,
      label:
        arTarget.label,
      description:
        targetDescriptionInput,
      source,
    });
  };

  const setTarget = (
    target: FieldGpsTarget,
  ) => {
    saveTargetMemoryFromTarget(target);
    setTargetPoint(target);
    setTargetLabelInput(target.label);
    setTargetLatitudeInput(
      formatCoordinate(
        target.latitude,
      ),
    );
    setTargetLongitudeInput(
      formatCoordinate(
        target.longitude,
      ),
    );
    setTargetDescriptionInput(
      target.description ?? "",
    );
    setTargetValidationError("");
    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:find-coordinate",
        {
          detail: {
            latitude:
              target.latitude,
            longitude:
              target.longitude,
            label:
              target.label,
            note:
              target.description,
            currentLatitude:
              readingRef.current?.latitude,
            currentLongitude:
              readingRef.current?.longitude,
            currentAccuracy:
              readingRef.current?.accuracyMeters,
          },
        },
      ),
    );
    setCaptureMessage(
      `${target.label} target point placed on the map.`,
    );
  };

  const setTargetFromReading = () => {
    if (!reading) {
      setCaptureMessage(
        "Waiting for location before setting target.",
      );
      return;
    }

    setTarget({
      id:
        createFieldGpsId(),
      label:
        targetLabelInput.trim() ||
        "Target Point",
      latitude:
        reading.latitude,
      longitude:
        reading.longitude,
      source:
        "current-position",
      description:
        targetDescriptionInput.trim(),
    });
  };

  const findPointFromKeyedCoordinate = () => {
    const label =
      targetLabelInput.trim() ||
      "Target Point";
    const trimmedLatitude =
      targetLatitudeInput.trim();
    const trimmedLongitude =
      targetLongitudeInput.trim();

    if (
      !trimmedLatitude ||
      !trimmedLongitude
    ) {
      setTargetValidationError(
        "Enter latitude and longitude in WGS84 decimal degrees.",
      );
      setCaptureMessage(
        "Enter latitude and longitude before finding the point.",
      );
      return;
    }

    const latitude =
      parseCoordinateInput(
        trimmedLatitude,
        -90,
        90,
      );
    const longitude =
      parseCoordinateInput(
        trimmedLongitude,
        -180,
        180,
      );

    if (latitude === null) {
      setTargetValidationError(
        "Latitude must be a decimal number between -90 and 90.",
      );
      setCaptureMessage(
        "Latitude is outside the valid WGS84 range.",
      );
      return;
    }

    if (longitude === null) {
      setTargetValidationError(
        "Longitude must be a decimal number between -180 and 180.",
      );
      setCaptureMessage(
        "Longitude is outside the valid WGS84 range.",
      );
      return;
    }

    setTarget({
      id:
        createFieldGpsId(),
      label:
        label,
      latitude,
      longitude,
      source:
        "manual",
      description:
        targetDescriptionInput.trim(),
    });
  };

  const setTargetFromPoint = (
    point: FieldGpsPoint,
  ) => {
    setTarget({
      id:
        point.id,
      label:
        point.label,
      latitude:
        point.latitude,
      longitude:
        point.longitude,
      source:
        "saved-point",
      description:
        point.note,
    });
  };

  const startNavigation = () => {
    if (!targetPoint) {
      setCaptureMessage(
        "Set a Target Point before starting navigation.",
      );
      return;
    }

    if (!gpsActive) {
      startGps();
    }

    setNavigationActive(true);
    setCaptureMessage(
      "Field Navigation started.",
    );
  };

  const stopNavigation = () => {
    setNavigationActive(false);
    setCaptureMessage(
      "Field Navigation stopped.",
    );
  };

  const dispatchTrackMyPosition = (
    gpsReading: FieldGpsReading,
  ) => {
    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:track-my-position",
        {
          detail: {
            latitude:
              gpsReading.latitude,
            longitude:
              gpsReading.longitude,
            accuracy:
              gpsReading.accuracyMeters,
            label:
              "Current GPS",
          },
        },
      ),
    );
  };

  const toggleTracking = () => {
    const lastReading =
      readingRef.current ?? reading;

    if (!lastReading) {
      setCaptureMessage(
        "Start GPS first to track your position.",
      );
      return;
    }

    dispatchTrackMyPosition(
      lastReading,
    );

    if (!gpsActive) {
      startGps();
    }

    setTracking((current) => {
      const next =
        !current;
      setCaptureMessage(
        next
          ? "Tracking started. Movement fixes will be stored in this session."
          : "Tracking stopped.",
      );
      return next;
    });
  };

  const openArStakeoutPage = () => {
    const arTarget =
      getArTargetFromInputsOrState();

    if (!arTarget) {
      setTargetValidationError(
        "Enter latitude and longitude in WGS84 decimal degrees.",
      );
      setCaptureMessage(
        "Enter a valid target coordinate before opening AR Guide.",
      );
      return;
    }

    if (
      !applyArTarget(
        arTarget,
        "key-in",
      )
    ) {
      setCaptureMessage(
        "Target coordinate is invalid. Please enter a valid coordinate before opening AR Guide.",
      );
      return;
    }

    const params =
      new URLSearchParams({
        targetLat:
          String(arTarget.latitude),
        targetLng:
          String(arTarget.longitude),
        targetLabel:
          arTarget.label,
      });

    router.push(
      `/ar-stakeout?${params.toString()}`,
    );
  };

  const updateCameraSupportDiagnostics =
    () => {
      const snapshot =
        getCameraSupportSnapshot();
      setCameraSecureContext(
        snapshot.secureContext,
      );
      setMediaDevicesSupported(
        snapshot.mediaDevicesSupported,
      );
      setGetUserMediaSupported(
        snapshot.getUserMediaSupported,
      );
      return snapshot;
    };

  const setCameraErrorDetails = (
    error: unknown,
  ) => {
    const details =
      getCameraErrorDetails(error);
    setCameraErrorName(details.name);
    setCameraErrorMessage(
      details.message,
    );
    return details;
  };

  const clearCameraErrorDetails = () => {
    setCameraErrorName("");
    setCameraErrorMessage("");
  };

  const requestMobileCameraStream =
    async () => {
      setCameraMode("environment");

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                facingMode:
                  {
                    ideal:
                      "environment",
                  },
                width: {
                  ideal: 1280,
                },
                height: {
                  ideal: 720,
                },
              },
              audio: false,
            },
          );
        clearCameraErrorDetails();
        return stream;
      } catch (firstError) {
        setCameraErrorDetails(
          firstError,
        );
      }

      setCameraMode("environment");

      try {
        const stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: {
                facingMode:
                  "environment",
              },
              audio: false,
            },
          );
        return stream;
      } catch (secondError) {
        setCameraErrorDetails(
          secondError,
        );
      }

      setCameraMode("fallback");

      return navigator.mediaDevices.getUserMedia(
        {
          video: true,
          audio: false,
        },
      );
    };

  const startCameraSession =
    async ({
      activateNavigation,
      requireTarget,
      testOnly,
    }: {
      activateNavigation: boolean;
      requireTarget: boolean;
      testOnly: boolean;
    }) => {
        if (
          requireTarget &&
          !targetPoint
        ) {
          setArMessage(
            "Set a Target Point before starting AR Guide.",
          );
          return;
        }

        flushSync(() => {
          setArActive(true);
          setCameraTestActive(testOnly);
        });

        const support =
          updateCameraSupportDiagnostics();

        if (!support.secureContext) {
          stopCameraStream();
          setCameraMode("unknown");
          setCameraStatus(
            "Failed to start",
          );
          clearCameraErrorDetails();
          setArMessage(
            "Camera requires HTTPS. Please open https://beta.sabahlot.com",
          );
          return;
        }

        if (
          !support.mediaDevicesSupported ||
          !support.getUserMediaSupported
        ) {
          stopCameraStream();
          setCameraMode("unknown");
          setCameraStatus(
            "Not supported",
          );
          clearCameraErrorDetails();
          setArMessage(
            "Camera is not supported in this browser. Open beta.sabahlot.com in Chrome Android or Safari iPhone.",
          );
          return;
        }

        try {
          stopCameraStream();
          setCameraStatus("Starting");
          setCameraMode("unknown");
          clearCameraErrorDetails();
          setArMessage(
            "Requesting camera permission.",
          );

          const stream =
            await requestMobileCameraStream();
          cameraStreamRef.current =
            stream;

          if (activateNavigation) {
            setNavigationActive(true);
          }

          const started =
            await playCameraStream(stream);

          if (!started) {
            setCameraStatus(
              "Failed to start",
            );
            setArMessage(
              "Camera stream started but video playback was blocked. Tap Test Camera or Start AR Guide again.",
            );
            return;
          }

          setCameraStatus("Active");
          setArMessage(
            testOnly
              ? "Camera test active."
              : "AR Guide active.",
          );
        } catch (error) {
          stopCameraStream();
          const details =
            setCameraErrorDetails(error);

          if (
            error instanceof DOMException &&
            (
              error.name ===
                "NotAllowedError" ||
              error.name ===
                "PermissionDeniedError"
            )
          ) {
            setCameraStatus(
              "Permission denied",
            );
            setArMessage(
              "Camera permission denied. Please allow camera access to use AR Guide.",
            );
            return;
          }

          setCameraStatus(
            "Failed to start",
          );
          setArMessage(
            `Camera failed to start: ${details.name}`,
          );
        }
      };

  const startArGuide = async () => {
    const arTarget =
      getArTargetFromInputsOrState();

    if (!arTarget) {
      setTargetValidationError(
        "Enter latitude and longitude in WGS84 decimal degrees.",
      );
      setArMessage(
        "Enter a valid target coordinate before starting AR Guide.",
      );
      return;
    }

    if (
      !applyArTarget(
        arTarget,
        "key-in",
      )
    ) {
      setArMessage(
        "Target coordinate is invalid. Please enter a valid coordinate before starting AR Guide.",
      );
      return;
    }

    await startCameraSession({
      activateNavigation: true,
      requireTarget: false,
      testOnly: false,
    });
  };

  const testCamera = async () => {
    await startCameraSession({
      activateNavigation: false,
      requireTarget: false,
      testOnly: true,
    });
  };

  const saveFoundPointRecord = (
    mode: FoundPointMode,
  ) => {
    if (!reading) {
      setCaptureMessage(
        "Start GPS and wait for a fix before saving a found point.",
      );
      return;
    }

    if (!targetPoint) {
      setCaptureMessage(
        "Set a Target Point before saving a found point.",
      );
      return;
    }

    if (accuracyBlocked) {
      setCaptureMessage(
        "GPS accuracy is weak. You may still save this point as approximate.",
      );
      return;
    }

    const start: [number, number] =
      [
        reading.latitude,
        reading.longitude,
      ];
    const end: [number, number] =
      [
        targetPoint.latitude,
        targetPoint.longitude,
      ];
    const distanceDifferenceMeters =
      calculateFieldGpsDistanceMeters(
        start,
        end,
      );
    const bearingDegrees =
      calculateFieldGpsBearingDegrees(
        start,
        end,
      );
    const note =
      foundPointNoteInput.trim() ||
      targetPoint.description ||
      "Saved from Handheld GPS.";
    const foundPoint =
      createFieldGpsPoint(
        reading,
        nextFoundLabel(
          foundPoints,
        ),
        "single",
        1,
        0,
        `${mode}; target ${targetPoint.label}; offset ${formatDistance(
          distanceDifferenceMeters,
        )} at ${bearingDegrees.toFixed(
          1,
        )} deg. ${note}`,
      );

    const record:
      FoundPointRecord = {
        id:
          foundPoint.id,
        fieldNoteLabel:
          PRELIMINARY_FIELD_ASSIST_LABEL,
        targetName:
          targetPoint.label,
        targetLatitude:
          targetPoint.latitude,
        targetLongitude:
          targetPoint.longitude,
        foundLatitude:
          reading.latitude,
        foundLongitude:
          reading.longitude,
        distanceDifferenceMeters,
        bearingDegrees,
        accuracyMeters:
          reading.accuracyMeters,
        gpsQualityGrade:
          qualityGrade,
        gpsSignalLabel:
          gpsSignalStatus.label,
        capturedAt:
          foundPoint.timestamp,
        timestamp:
          foundPoint.timestamp,
        note,
        mode,
      };

    setFoundPoints(
      (current) => [
        ...current,
        foundPoint,
      ],
    );
    setFoundPointRecords(
      (current) => [
        ...current,
        record,
      ],
    );
    setCaptureMessage(
      `${PRELIMINARY_FIELD_ASSIST_LABEL} saved locally in ${mode}; offset ${formatDistance(
        distanceDifferenceMeters,
      )}.`,
    );
  };

  const recordFoundPoint = () => {
    saveFoundPointRecord(
      "Phone GPS",
    );
  };

  const addSinglePoint = () => {
    if (!reading) {
      setCaptureMessage(
        "Waiting for location.",
      );
      return;
    }

    if (accuracyBlocked) {
      setCaptureMessage(
        "GPS accuracy is weak. You may still save this point as approximate.",
      );
      return;
    }

    savePoint(
      createFieldGpsPoint(
        reading,
        nextLabel(points),
        "single",
        1,
        0,
      ),
    );
  };

  const collectReadings = (
    seconds: number,
  ) =>
    new Promise<FieldGpsReading[]>(
      (resolve) => {
        const collected:
          FieldGpsReading[] = [];
        const watchId =
          navigator.geolocation.watchPosition(
            (position) => {
              collected.push(
                readingFromPosition(
                  position,
                ),
              );
            },
            () => undefined,
            GEOLOCATION_OPTIONS,
          );

        window.setTimeout(
          () => {
            navigator.geolocation.clearWatch(
              watchId,
            );
            if (
              collected.length === 0 &&
              readingRef.current
            ) {
              collected.push(
                readingRef.current,
              );
            }
            resolve(collected);
          },
          seconds * 1000,
        );
      },
    );

  const captureOccupiedPoint = async (
    mode: CaptureMode,
  ) => {
    if (!navigator.geolocation) {
      setCaptureMessage(
        "Location services are not supported.",
      );
      return;
    }

    setCaptureBusy(mode);
    setCaptureMessage(
      `Collecting ${mode} readings for ${occupationSeconds} seconds...`,
    );

    const samples =
      await collectReadings(
        occupationSeconds,
      );
    const selected =
      mode === "best-fix"
        ? bestFixReading(samples)
        : averageReadings(
            samples,
          ).reading;

    if (!selected) {
      setCaptureMessage(
        "No usable GPS reading collected.",
      );
      setCaptureBusy(null);
      return;
    }

    if (
      gateMeters !== null &&
      selected.accuracyMeters !==
        undefined &&
      selected.accuracyMeters >
        gateMeters &&
      !allowApproximate
    ) {
      setCaptureMessage(
        "GPS accuracy is weak. You may still save this point as approximate.",
      );
      setCaptureBusy(null);
      return;
    }

    const averaged =
      mode === "averaged"
        ? averageReadings(samples)
        : null;
    const note =
      mode === "averaged" &&
      averaged
        ? `Average accuracy ${formatAccuracy(
            selected.accuracyMeters,
          )}; best accuracy ${formatAccuracy(
            averaged.bestAccuracy,
          )}; rejected readings ${averaged.rejectedCount}.`
        : undefined;

    savePoint(
      createFieldGpsPoint(
        selected,
        nextLabel(points),
        mode === "best-fix"
          ? "best-fix"
          : "averaged",
        mode === "averaged"
          ? averaged?.acceptedCount ??
              samples.length
          : samples.length,
        occupationSeconds,
        note,
      ),
    );
    setCaptureBusy(null);
  };

  const repeatObservation = (
    point: FieldGpsPoint,
  ) => {
    if (!reading) {
      return;
    }

    savePoint(
      createFieldGpsPoint(
        reading,
        `${point.label}-R2`,
        "single",
        1,
        0,
        `Repeat observation for ${point.label}; preliminary approximate phone GPS reference only.`,
      ),
    );
  };

  const startRenamingPoint = (
    point: FieldGpsPoint,
  ) => {
    setRenamingPointId(point.id);
    setRenameDraft(point.label);
  };

  const cancelRenamingPoint = () => {
    setRenamingPointId(null);
    setRenameDraft("");
  };

  const confirmRenamingPoint = () => {
    const trimmed = renameDraft.trim();

    if (!renamingPointId || !trimmed) {
      cancelRenamingPoint();
      return;
    }

    setPoints((current) =>
      current.map((item) =>
        item.id === renamingPointId
          ? { ...item, label: trimmed }
          : item,
      ),
    );
    setCaptureMessage(
      `Point renamed to ${trimmed}.`,
    );
    cancelRenamingPoint();
  };

  const deletePointWithConfirmation = (
    point: FieldGpsPoint,
  ) => {
    if (
      !window.confirm(
        `Delete point "${point.label}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setPoints((current) =>
      current.filter(
        (item) => item.id !== point.id,
      ),
    );

    if (renamingPointId === point.id) {
      cancelRenamingPoint();
    }

    setCaptureMessage(
      `Point "${point.label}" deleted.`,
    );
  };

  const deleteFoundPointWithConfirmation = (
    point: FieldGpsPoint,
  ) => {
    if (
      !window.confirm(
        `Delete found point "${point.label}"? This cannot be undone.`,
      )
    ) {
      return;
    }

    setFoundPoints((current) =>
      current.filter(
        (item) => item.id !== point.id,
      ),
    );
    setFoundPointRecords((current) =>
      current.filter(
        (item) => item.id !== point.id,
      ),
    );
    setCaptureMessage(
      `Found point "${point.label}" deleted.`,
    );
  };

  const generatePolygon = () => {
    const polygon =
      createPreliminaryPolygonResult(
        points,
      );

    if (!polygon) {
      setCaptureMessage(
        "Minimum 3 GPS points required.",
      );
      return;
    }

    setGeneratedPolygon(polygon);
    onPolygonGenerated?.(polygon);
    setCaptureMessage(
      "Preliminary polygon generated. Estimated area only.",
    );
  };

  const exportInput = {
    recordName,
    points:
      allRecordedPoints,
    estimatedAreaM2:
      generatedPolygon?.areaM2,
    polygonCoordinates:
      generatedPolygon?.coordinates,
    trackLog,
    offlineMapNote,
  };

  const targetGoogleMapsUrl =
    targetPoint
      ? buildGoogleMapsUrl(
          targetPoint.latitude,
          targetPoint.longitude,
        )
      : "";
  const targetWazeUrl =
    targetPoint
      ? buildWazeUrl(
          targetPoint.latitude,
          targetPoint.longitude,
        )
      : "";

  const safeFileName =
    (recordName?.trim() ||
      "preliminary-field-gps")
      .replace(
        /[^a-z0-9-_]+/gi,
        "-",
      )
      .replace(
        /^-+|-+$/g,
        "",
      )
      .toLowerCase();

  return (
    <section
      className="sl-field-gps-panel"
      onClick={(event) =>
        event.stopPropagation()
      }
    >
      <button
        type="button"
        className="sl-field-gps-toggle"
        onClick={() => {
          if (
            open &&
            arActive
          ) {
            stopArGuide();
          }

          setOpen(
            (current) => {
              const nextOpen =
                !current;

              if (nextOpen) {
                window.dispatchEvent(
                  new CustomEvent(
                    "sabahlot:field-gps-panel-opened",
                  ),
                );
              }

              return nextOpen;
            },
          );
        }}
      >
        <span className="sl-field-gps-toggle-label-full">
          Handheld GPS
        </span>
        <span className="sl-field-gps-toggle-label-short">
          GPS
        </span>
      </button>

      {open && (
        <div className="sl-field-gps-card">
          <div className="sl-field-gps-heading">
            <div>
              <span>Handheld GPS</span>
              <strong>
                {points.length} points | {foundPoints.length} found
              </strong>
            </div>
            <button
              type="button"
              className="sl-field-gps-close"
              onClick={closeFieldGpsPanel}
              aria-label="Close Handheld GPS"
            >
              Close
            </button>
          </div>

          <p className="sl-field-gps-note">
            Preliminary Field Assist
          </p>

          <p className="sl-field-gps-note">
            Capture works without signal. Map tiles and AR camera view
            need a connection.
          </p>

          <FieldGpsAccuracyPanel
            reading={reading}
            status={status}
            qualityGrade={qualityGrade}
            gpsSignalLabel={
              gpsSignalStatus.label
            }
            gpsSignalClassName={
              gpsSignalStatus.className
            }
            gateMeters={gateMeters}
            onGateChange={setGateMeters}
            allowApproximate={
              allowApproximate
            }
            onAllowApproximateChange={
              setAllowApproximate
            }
          />

          <p className="sl-field-gps-disclaimer">
            This grade reflects device GPS accuracy only, not
            cadastral-grade QA/QC (HRMS/VRMS/PDOP). For full QA/QC on raw
            GNSS observations, use the Pembantu e-BKL tool.
          </p>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={openArStakeoutPage}
                className="sl-field-gps-action-primary"
              >
                AR Guide
              </button>
              <button
                type="button"
                onClick={toggleGps}
                className={
                  gpsActive
                    ? "is-active"
                    : ""
                }
              >
                {gpsActive
                  ? "Stop GPS"
                  : "Start GPS"}
              </button>
              <button
                type="button"
                onClick={toggleTracking}
                className={
                  tracking
                    ? "is-active"
                    : ""
                }
              >
                {tracking
                  ? "Stop Tracking"
                  : "Track My Position"}
              </button>
              <button
                type="button"
                onClick={recordFoundPoint}
                disabled={
                  !reading ||
                  !targetPoint
                }
              >
                Save Field Note
              </button>
            </div>

            <div className="sl-field-gps-grid">
              <span>GPS signal</span>
              <strong>
                <span
                  className={
                    gpsSignalStatus.className
                  }
                >
                  {gpsSignalStatus.label}
                </span>
              </strong>
              <span>GPS state</span>
              <strong>
                {gpsActive
                  ? "Started"
                  : "Stopped"}
              </strong>
              <span>Tracking state</span>
              <strong>
                {tracking
                  ? "Started"
                  : "Stopped"}
              </strong>
              <span>Navigation</span>
              <strong>
                {navigationActive
                  ? "Started"
                  : "Stopped"}
              </strong>
              <span>Camera</span>
              <strong>
                Camera: {cameraStatus}
              </strong>
              <span>Track fixes</span>
              <strong>
                {trackLog.length}
              </strong>
            </div>
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Key-in Coordinate</span>
              <strong>
                {targetPoint
                  ? targetPoint.label
                  : "Not set"}
              </strong>
            </div>

            <label className="sl-field-gps-label">
              <span>Point Name</span>
              <input
                type="text"
                value={targetLabelInput}
                onChange={(event) =>
                  setTargetLabelInput(
                    event.target.value,
                  )
                }
                placeholder="Target Point"
              />
            </label>

            <div className="sl-field-gps-target-grid">
              <label className="sl-field-gps-label">
                <span>Latitude</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0000001"
                  value={targetLatitudeInput}
                  onChange={(event) =>
                    setTargetLatitudeInput(
                      event.target.value,
                    )
                  }
                  placeholder="5.980412"
                />
              </label>

              <label className="sl-field-gps-label">
                <span>Longitude</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.0000001"
                  value={targetLongitudeInput}
                  onChange={(event) =>
                    setTargetLongitudeInput(
                      event.target.value,
                    )
                  }
                  placeholder="116.073456"
                />
              </label>
            </div>

            <label className="sl-field-gps-label">
              <span>Description optional</span>
              <textarea
                value={targetDescriptionInput}
                onChange={(event) =>
                  setTargetDescriptionInput(
                    event.target.value,
                  )
                }
                rows={3}
                placeholder="Optional field note"
              />
            </label>

            {targetValidationError && (
              <p className="sl-field-gps-warning">
                {targetValidationError}
              </p>
            )}

            <label className="sl-field-gps-label">
              <span>Select saved point as target</span>
              <select
                value={
                  targetPoint?.source ===
                  "saved-point"
                    ? targetPoint.id
                    : ""
                }
                onChange={(event) => {
                  const selectedPoint =
                    allRecordedPoints.find(
                      (point) =>
                        point.id ===
                        event.target.value,
                    );

                  if (selectedPoint) {
                    setTargetFromPoint(
                      selectedPoint,
                    );
                  }
                }}
                disabled={
                  allRecordedPoints.length ===
                  0
                }
              >
                <option value="">
                  Choose point
                </option>
                {allRecordedPoints.map(
                  (point) => (
                    <option
                      key={point.id}
                      value={point.id}
                    >
                      {point.label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={findPointFromKeyedCoordinate}
              >
                Find Point
              </button>
              <button
                type="button"
                onClick={setTargetFromReading}
                disabled={!reading}
              >
                Use Current
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetPoint(null);
                  setTargetValidationError("");
                  window.dispatchEvent(
                    new CustomEvent(
                      "sabahlot:clear-coordinate-marker",
                    ),
                  );
                  setCaptureMessage(
                    "Target Point cleared.",
                  );
                }}
                disabled={!targetPoint}
              >
                Clear Target
              </button>
              <a
                className={`sl-field-gps-link-button ${
                  targetPoint
                    ? ""
                    : "is-disabled"
                }`}
                href={
                  targetPoint
                    ? targetGoogleMapsUrl
                    : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!targetPoint}
              >
                Google Maps
              </a>
              <a
                className={`sl-field-gps-link-button ${
                  targetPoint
                    ? ""
                    : "is-disabled"
                }`}
                href={
                  targetPoint
                    ? targetWazeUrl
                    : undefined
                }
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!targetPoint}
              >
                Waze
              </a>
            </div>

            <div className="sl-field-gps-grid">
              <span>Target point name</span>
              <strong>
                {targetPoint
                  ? targetPoint.label
                  : "-"}
              </strong>
              <span>Target coordinate</span>
              <strong>
                {targetPoint
                  ? `${formatCoordinate(
                      targetPoint.latitude,
                    )}, ${formatCoordinate(
                      targetPoint.longitude,
                    )}`
                  : "-"}
              </strong>
              <span>Current GPS accuracy</span>
              <strong>
                {reading?.accuracyMeters !==
                undefined
                  ? formatAccuracy(
                      reading.accuracyMeters,
                    )
                  : "-"}
              </strong>
              <span>Distance to target</span>
              <strong>
                {targetNavigation
                  ? formatDistance(
                      targetNavigation.distanceMeters,
                    )
                  : "-"}
              </strong>
              <span>Bearing to target</span>
              <strong>
                {targetNavigation
                  ? `${targetNavigation.bearingDegrees.toFixed(
                      1,
                    )} deg`
                  : "-"}
              </strong>
              <span>Bearing DMS</span>
              <strong>
                {targetNavigation
                  ? targetNavigation.bearingDms
                  : "-"}
              </strong>
              <span>Target status</span>
              <strong>
                {targetNavigation
                  ? getTargetZoneStatus(
                      targetNavigation.distanceMeters,
                    )
                  : "-"}
              </strong>
              <span>Device heading</span>
              <strong>
                {reading?.heading !== null &&
                reading?.heading !== undefined
                  ? `${reading.heading.toFixed(
                      0,
                    )} deg`
                  : "Not available"}
              </strong>
            </div>

            <div className="sl-field-gps-navigation">
              <div
                className="sl-field-gps-arrow"
                style={{
                  transform: `rotate(${directionArrowDegrees}deg)`,
                }}
                aria-hidden="true"
              >
                &uarr;
              </div>
              <div>
                <strong>
                  {navigationActive
                    ? "Field Navigation active"
                    : "Field Navigation ready"}
                </strong>
                <span
                  className={
                    gpsSignalStatus.className
                  }
                >
                  {gpsSignalStatus.label}
                </span>
                <span>
                  {targetNavigation
                    ? `Arrow uses ${
                        reading?.heading !==
                          null &&
                        reading?.heading !==
                          undefined
                          ? "device heading"
                          : "map north"
                      }; bearing ${targetNavigation.bearingDegrees.toFixed(
                        1,
                      )} deg.`
                    : "Set a Target Point and start GPS."}
                </span>
              </div>
            </div>

            <label className="sl-field-gps-label">
              <span>Found point note</span>
              <textarea
                value={foundPointNoteInput}
                onChange={(event) =>
                  setFoundPointNoteInput(
                    event.target.value,
                  )
                }
                rows={2}
                placeholder="Optional note for Save Field Note"
              />
            </label>

            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={
                  navigationActive
                    ? stopNavigation
                    : startNavigation
                }
                disabled={!targetPoint}
                className={
                  navigationActive
                    ? "is-active"
                    : ""
                }
              >
                {navigationActive
                  ? "Stop Navigation"
                  : "Start Navigation"}
              </button>
              <button
                type="button"
                onClick={
                  arActive
                    ? stopArGuide
                    : () =>
                        void startArGuide()
                }
                className={
                  arActive
                    ? "is-active"
                    : ""
                }
              >
                {arActive
                  ? "Stop AR Guide"
                  : "Start AR Guide"}
              </button>
              <button
                type="button"
                onClick={() =>
                  void testCamera()
                }
              >
                Test Camera
              </button>
              <button
                type="button"
                onClick={() =>
                  saveFoundPointRecord(
                    arActive
                      ? "AR Find Point Lite"
                      : "Phone GPS",
                  )
                }
                disabled={
                  !reading ||
                  !targetPoint
                }
              >
                Save Field Note
              </button>
            </div>

            {arMessage && (
              <p className="sl-field-gps-note">
                {arMessage}
              </p>
            )}

            {targetNavigation &&
              reading?.accuracyMeters !==
                undefined &&
              reading.accuracyMeters >
                targetNavigation.distanceMeters && (
                <p className="sl-field-gps-warning">
                  Accuracy warning: current GPS accuracy is greater than the distance to target.
                </p>
              )}

            <p className="sl-field-gps-disclaimer">
              {FIELD_NAVIGATION_SAFETY_LABEL}
            </p>
          </section>

          {arActive && (
            <section
              className="sl-ar-guide"
              aria-label="AR Guide"
            >
              <video
                ref={videoRef}
                className="sl-ar-video"
                {...MOBILE_AR_VIDEO_ATTRIBUTES}
                onLoadedMetadata={
                  handleVideoLoadedMetadata
                }
                playsInline
                muted
                autoPlay
                disablePictureInPicture
              />
              <div className="sl-ar-overlay">
                <div className="sl-ar-guide-heading">
                  <strong>
                    {cameraTestActive
                      ? "Camera Test"
                      : "AR Guide"}
                  </strong>
                  <button
                    type="button"
                    onClick={stopArGuide}
                  >
                    Stop AR Guide
                  </button>
                </div>
                <div className="sl-ar-guide-target">
                  <span>
                    {targetPoint?.label ??
                      "Target Point"}
                  </span>
                  <strong>
                    {targetNavigation
                      ? formatDistance(
                          targetNavigation.distanceMeters,
                        )
                      : "-"}
                  </strong>
                </div>
                <p className="sl-ar-guide-status">
                  Camera: {cameraStatus}
                </p>
                <p className="sl-ar-guide-status">
                  <span
                    className={
                      gpsSignalStatus.className
                    }
                  >
                    {gpsSignalStatus.label}
                  </span>
                </p>
                <div
                  className="sl-ar-guide-arrow"
                  style={{
                    transform: `rotate(${directionArrowDegrees}deg)`,
                  }}
                  aria-hidden="true"
                >
                  &uarr;
                </div>
                <div className="sl-field-gps-grid">
                  <span>GPS signal</span>
                  <strong>
                    <span
                      className={
                        gpsSignalStatus.className
                      }
                    >
                      {gpsSignalStatus.label}
                    </span>
                  </strong>
                  <span>Bearing</span>
                  <strong>
                    {targetNavigation
                      ? `${targetNavigation.bearingDegrees.toFixed(
                          1,
                        )} deg`
                      : "-"}
                  </strong>
                  <span>Accuracy</span>
                  <strong>
                    {reading?.accuracyMeters !==
                    undefined
                      ? formatAccuracy(
                          reading.accuracyMeters,
                        )
                      : "-"}
                  </strong>
                  <span>Mode</span>
                  <strong>
                    {cameraTestActive
                      ? "Camera Test"
                      : "AR Find Point Lite"}
                  </strong>
                  <span>Secure context</span>
                  <strong>
                    {cameraSecureContext
                      ? "yes"
                      : "no"}
                  </strong>
                  <span>MediaDevices support</span>
                  <strong>
                    {mediaDevicesSupported
                      ? "yes"
                      : "no"}
                  </strong>
                  <span>getUserMedia support</span>
                  <strong>
                    {getUserMediaSupported
                      ? "yes"
                      : "no"}
                  </strong>
                  <span>Camera status</span>
                  <strong>
                    {cameraStatus}
                  </strong>
                  <span>Camera mode attempted</span>
                  <strong>
                    {cameraMode}
                  </strong>
                  <span>Last camera error name</span>
                  <strong>
                    {cameraErrorName || "-"}
                  </strong>
                  <span>Last camera error message</span>
                  <strong>
                    {cameraErrorMessage || "-"}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() =>
                  saveFoundPointRecord(
                      "AR Find Point Lite",
                    )
                  }
                  disabled={
                    !reading ||
                    !targetPoint
                  }
                >
                  Save Field Note
                </button>
                <p className="sl-field-gps-disclaimer">
                  {FIELD_NAVIGATION_SAFETY_LABEL}
                </p>
              </div>
            </section>
          )}

          <section className="sl-field-gps-section">
            <label className="sl-field-gps-label">
              <span>Occupation time</span>
              <select
                value={occupationSeconds}
                onChange={(event) =>
                  setOccupationSeconds(
                    Number(
                      event.target.value,
                    ),
                  )
                }
              >
                {OCCUPATION_OPTIONS.map(
                  (seconds) => (
                    <option
                      key={seconds}
                      value={seconds}
                    >
                      {seconds} seconds
                    </option>
                  ),
                )}
              </select>
            </label>

            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={addSinglePoint}
                disabled={!reading}
              >
                Add Point
              </button>
              <button
                type="button"
                onClick={() =>
                  void captureOccupiedPoint(
                    "best-fix",
                  )
                }
                disabled={
                  captureBusy !== null
                }
              >
                Capture Best Fix
              </button>
              <button
                type="button"
                onClick={() =>
                  void captureOccupiedPoint(
                    "averaged",
                  )
                }
                disabled={
                  captureBusy !== null
                }
              >
                Capture Averaged Point
              </button>
            </div>

            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={generatePolygon}
                disabled={points.length < 3}
              >
                Generate Polygon
              </button>
              <button
                type="button"
                onClick={toggleTracking}
              >
                {tracking
                  ? "Stop Tracking"
                  : "Start Tracking"}
              </button>
            </div>

            <div className="sl-field-gps-actions">
              <button
                type="button"
                onClick={() =>
                  void exportFieldGpsPdf(
                    exportInput,
                  )
                }
                disabled={
                  allRecordedPoints.length ===
                  0
                }
              >
                Export PDF
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    buildFieldGpsKml(
                      exportInput,
                    ),
                    `${safeFileName}.kml`,
                    "application/vnd.google-earth.kml+xml",
                  )
                }
                disabled={
                  allRecordedPoints.length ===
                  0
                }
              >
                Export KML
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    buildFieldGpsCsv(
                      allRecordedPoints,
                    ),
                    `${safeFileName}.csv`,
                    "text/csv",
                  )
                }
                disabled={
                  allRecordedPoints.length ===
                  0
                }
              >
                Export CSV
              </button>
            </div>

            {captureMessage && (
              <p className="sl-field-gps-note">
                {captureMessage}
              </p>
            )}

            {generatedPolygon && (
              <p className="sl-field-gps-note">
                Estimated area only: {generatedPolygon.areaM2.toFixed(2)} m2
              </p>
            )}
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Point list</span>
              <strong>
                Track {trackLog.length}
              </strong>
            </div>

            {points.length === 0 ? (
              <p className="sl-field-gps-note">
                No preliminary phone GPS points captured yet.
              </p>
            ) : (
              <div className="sl-field-gps-point-list">
                {points.map(
                  (point) => (
                    <article
                      key={point.id}
                      className="sl-field-gps-point"
                    >
                      <div>
                        {renamingPointId === point.id ? (
                          <div className="sl-field-gps-rename">
                            <input
                              type="text"
                              value={renameDraft}
                              onChange={(event) =>
                                setRenameDraft(
                                  event.target.value,
                                )
                              }
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={confirmRenamingPoint}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={cancelRenamingPoint}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <strong>
                            {point.label}
                          </strong>
                        )}
                        <span>
                          {point.source === "keyed-coordinate"
                            ? "Keyed coordinate"
                            : "Phone GPS"} | {formatAccuracy(
                              point.accuracyMeters,
                            )} | Grade {point.qualityGrade} | {point.captureMethod}
                        </span>
                        <small>
                          {formatCoordinate(point.latitude)}, {formatCoordinate(point.longitude)}
                        </small>
                        <small>
                          {point.timestamp}
                          {point.note
                            ? ` | ${point.note}`
                            : ""}
                        </small>
                      </div>
                      <div className="sl-field-gps-point-actions">
                        <button
                          type="button"
                          onClick={() =>
                            repeatObservation(
                              point,
                            )
                          }
                        >
                          Repeat
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setTargetFromPoint(
                              point,
                            )
                          }
                        >
                          Target
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            startRenamingPoint(
                              point,
                            )
                          }
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deletePointWithConfirmation(
                              point,
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Found points</span>
              <strong>
                {foundPoints.length}
              </strong>
            </div>

            {foundPoints.length === 0 ? (
              <p className="sl-field-gps-note">
                No found point recorded yet.
              </p>
            ) : (
              <div className="sl-field-gps-point-list">
                {foundPoints.map(
                  (point) => (
                    <article
                      key={point.id}
                      className="sl-field-gps-point"
                    >
                      <div>
                        <strong>
                          {point.label}
                        </strong>
                        <span>
                          {formatCoordinate(
                            point.latitude,
                          )}, {formatCoordinate(
                            point.longitude,
                          )} | {formatAccuracy(
                            point.accuracyMeters,
                          )} | Grade {point.qualityGrade}
                        </span>
                        <small>
                          {point.timestamp}
                          {point.note
                            ? ` | ${point.note}`
                            : ""}
                        </small>
                      </div>
                      <div className="sl-field-gps-point-actions">
                        <button
                          type="button"
                          onClick={() =>
                            setTargetFromPoint(
                              point,
                            )
                          }
                        >
                          Target
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deleteFoundPointWithConfirmation(
                              point,
                            )
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Field Notes</span>
              <strong>
                {foundPointRecords.length}
              </strong>
            </div>

            {foundPointRecords.length ===
            0 ? (
              <p className="sl-field-gps-note">
                No local field note saved yet.
              </p>
            ) : (
              <div className="sl-field-gps-point-list">
                {foundPointRecords.map(
                  (record) => (
                    <article
                      key={record.id}
                      className="sl-field-gps-point"
                    >
                      <div>
                        <strong>
                          {record.fieldNoteLabel} | {record.targetName}
                        </strong>
                        <span>
                          Capture mode {record.mode}
                        </span>
                        <span>
                          Target {formatCoordinate(
                            record.targetLatitude,
                          )}, {formatCoordinate(
                            record.targetLongitude,
                          )}
                        </span>
                        <span>
                          Found {formatCoordinate(
                            record.foundLatitude,
                          )}, {formatCoordinate(
                            record.foundLongitude,
                          )}
                        </span>
                        <small>
                          Offset {formatDistance(
                            record.distanceDifferenceMeters,
                          )} | Bearing {record.bearingDegrees.toFixed(
                            1,
                          )} deg | Accuracy {formatAccuracy(
                            record.accuracyMeters,
                          )} | Quality {record.gpsQualityGrade}
                        </small>
                        <small>
                          GPS {record.gpsSignalLabel}
                        </small>
                        <small>
                          {formatTimestamp(
                            record.capturedAt,
                          )}
                          {record.note
                            ? ` | ${record.note}`
                            : ""}
                        </small>
                      </div>
                      <div className="sl-field-gps-point-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setFoundPointRecords(
                              (current) =>
                                current.filter(
                                  (item) =>
                                    item.id !==
                                    record.id,
                                ),
                            );
                            setFoundPoints(
                              (current) =>
                                current.filter(
                                  (item) =>
                                    item.id !==
                                    record.id,
                                ),
                            );
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>

          <p className="sl-field-gps-disclaimer">
            {FIELD_GPS_DISCLAIMER}
          </p>

          <section className="sl-field-gps-section sl-beta-help-section">
            <div className="sl-field-gps-heading">
              <span>Bantuan &amp; Maklum Balas Beta</span>
            </div>

            <div className="sl-field-gps-target-grid">
              <FeedbackForm />
              <BugReportButton />
              <FeedbackExportButton />
              <Link href="/manual-beta" className="sl-beta-action-button">
                Manual Pengguna Beta
              </Link>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
