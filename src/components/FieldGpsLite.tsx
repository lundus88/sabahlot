"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  PolygonResult,
} from "@/app/components/Map";

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
} from "@/lib/field-gps.types";

import {
  getGpsQualityGrade,
} from "@/lib/gps-quality";

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
  | "environment preferred"
  | "fallback camera";

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
  targetName: string;
  targetLatitude: number;
  targetLongitude: number;
  foundLatitude: number;
  foundLongitude: number;
  distanceDifferenceMeters: number;
  bearingDegrees: number;
  accuracyMeters?: number;
  timestamp: string;
  note: string;
  mode: FoundPointMode;
}

const OCCUPATION_OPTIONS = [
  10,
  20,
  30,
  60,
];

const FIELD_NAVIGATION_SAFETY_LABEL =
  "Preliminary Field Navigation Only · Not for cadastral boundary determination.";

const FIELD_NAVIGATION_SAFETY_LABEL_MS =
  "Navigasi awal sahaja. Bukan penentuan sempadan kadaster rasmi.";

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
    "GPS Lost · Tiada sambungan lokasi";
  const weakLabel =
    "GPS Weak · Signal lemah";
  const strongLabel =
    "GPS Active · Signal kuat";

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
        ? ` · ±${position.accuracyMeters.toFixed(
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

function describeCameraError(
  error: unknown,
): string {
  if (error instanceof DOMException) {
    return error.message
      ? `${error.name}: ${error.message}`
      : error.name;
  }

  if (error instanceof Error) {
    return error.message
      ? `${error.name}: ${error.message}`
      : error.name;
  }

  return "UnknownError";
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

export default function FieldGpsLite({
  enabled,
  recordName,
  offlineMapNote,
  onPolygonGenerated,
}: FieldGpsLiteProps) {
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
    "environment preferred",
  );
  const [
    cameraSupported,
    setCameraSupported,
  ] = useState(false);
  const [
    cameraError,
    setCameraError,
  ] = useState("");
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

        if (
          "disablePictureInPicture" in
          video
        ) {
          video.disablePictureInPicture =
            true;
        }

        video.srcObject = stream;

        try {
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
          "Camera started but video playback was blocked. Tap Start AR Guide again.",
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
            "Camera started but video playback was blocked. Tap Start AR Guide again.",
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

  const setTarget = (
    target: FieldGpsTarget,
  ) => {
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

  const stopArGuide = () => {
    stopCameraStream();
    setArActive(false);
    setCameraStatus("Stopped");
    setArMessage("AR Guide stopped.");
  };

  const startArGuide = async () => {
    if (!targetPoint) {
      setArMessage(
        "Set a Target Point before starting AR Guide.",
      );
      return;
    }

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraSupported(false);
      setCameraStatus("Not supported");
      setCameraError("");
      setArMessage(
        "Camera is not supported in this browser.",
      );
      return;
    }

    try {
      stopCameraStream();
      setCameraStatus("Starting");
      setCameraMode(
        "environment preferred",
      );
      setCameraSupported(true);
      setCameraError("");
      setArMessage(
        "Requesting camera permission.",
      );
      let stream: MediaStream;

      try {
        stream =
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
      } catch (environmentError) {
        setCameraMode(
          "fallback camera",
        );
        setCameraError(
          describeCameraError(
            environmentError,
          ),
        );
        stream =
          await navigator.mediaDevices.getUserMedia(
            {
              video: true,
              audio: false,
            },
          );
      }

      if (!videoRef.current) {
        setArActive(true);
      }

      cameraStreamRef.current =
        stream;
      setArActive(true);
      setNavigationActive(true);

      if (videoRef.current) {
        const started =
          await playCameraStream(
            stream,
          );

        if (!started) {
          setCameraStatus(
            "Failed to start",
          );
          setArMessage(
            "Camera started but video playback was blocked. Tap Start AR Guide again.",
          );
          return;
        }

        setCameraStatus("Active");
      }

      setArMessage(
        "AR Guide active.",
      );
    } catch (error) {
      stopCameraStream();
      setArActive(false);
      setCameraError(
        describeCameraError(error),
      );
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
        "Camera failed to start. Please check camera access and try again.",
      );
    }
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
        "GPS accuracy is weak. Move to an open area and wait for better accuracy. You may still save this point as approximate.",
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
      `${foundPoint.label} saved locally in ${mode}; offset ${formatDistance(
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
        "GPS accuracy is weak. Move to an open area and wait for better accuracy. You may still save this point as approximate.",
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
        "GPS accuracy is weak. Move to an open area and wait for better accuracy. You may still save this point as approximate.",
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
    <section className="sl-field-gps-panel">
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
            (current) => !current,
          );
        }}
      >
        Handheld GPS
      </button>

      {open && (
        <div className="sl-field-gps-card">
          <div className="sl-field-gps-heading">
            <span>Handheld GPS</span>
            <strong>
              {points.length} points | {foundPoints.length} found
            </strong>
          </div>

          <p className="sl-field-gps-note">
            Internal founder field test only.
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

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-actions">
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
                Save Found Point
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
                placeholder="Optional note for Save Found Point"
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
                disabled={!targetPoint}
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
                Save Found Point
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
              <br />
              {FIELD_NAVIGATION_SAFETY_LABEL_MS}
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
                    AR Guide
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
                    AR Find Point Lite
                  </strong>
                  <span>Browser support</span>
                  <strong>
                    {cameraSupported
                      ? "supported"
                      : "not supported"}
                  </strong>
                  <span>Using camera</span>
                  <strong>
                    {cameraMode}
                  </strong>
                  <span>Last camera error</span>
                  <strong>
                    {cameraError
                      ? `Camera error: ${cameraError}`
                      : "-"}
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
                  Save Found Point
                </button>
                <p className="sl-field-gps-disclaimer">
                  {FIELD_NAVIGATION_SAFETY_LABEL}
                  <br />
                  {FIELD_NAVIGATION_SAFETY_LABEL_MS}
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
                        <strong>
                          {point.label}
                        </strong>
                        <span>
                          {point.source === "keyed-coordinate"
                            ? "Keyed coordinate"
                            : "Phone GPS"} | {formatAccuracy(
                              point.accuracyMeters,
                            )} | Grade {point.qualityGrade} | {point.captureMethod}
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
                            setPoints(
                              (current) =>
                                current.filter(
                                  (item) =>
                                    item.id !==
                                    point.id,
                                ),
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
                          onClick={() => {
                            setFoundPoints(
                              (current) =>
                                current.filter(
                                  (item) =>
                                    item.id !==
                                    point.id,
                                ),
                            );
                            setFoundPointRecords(
                              (current) =>
                                current.filter(
                                  (item) =>
                                    item.id !==
                                    point.id,
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

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Saved found point records</span>
              <strong>
                {foundPointRecords.length}
              </strong>
            </div>

            {foundPointRecords.length ===
            0 ? (
              <p className="sl-field-gps-note">
                No local found point record saved yet.
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
                          {record.targetName} | {record.mode}
                        </strong>
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
                          )}
                        </small>
                        <small>
                          {formatTimestamp(
                            record.timestamp,
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
        </div>
      )}
    </section>
  );
}
