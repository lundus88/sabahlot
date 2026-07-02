"use client";

import {
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

interface FieldGpsTarget {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  source: TargetSource;
}

const OCCUPATION_OPTIONS = [
  10,
  20,
  30,
  60,
];

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
    "Waiting for location",
  );
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
    targetPoint,
    setTargetPoint,
  ] = useState<FieldGpsTarget | null>(
    null,
  );
  const [
    targetLabelInput,
    setTargetLabelInput,
  ] = useState("Target");
  const [
    targetLatitudeInput,
    setTargetLatitudeInput,
  ] = useState("");
  const [
    targetLongitudeInput,
    setTargetLongitudeInput,
  ] = useState("");
  const [
    tracking,
    setTracking,
  ] = useState(false);
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

  const qualityGrade =
    useMemo(
      () =>
        getGpsQualityGrade(
          reading?.accuracyMeters,
        ),
      [reading],
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

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!navigator.geolocation) {
      window.setTimeout(
        () =>
          setStatus(
            "Location services are not supported.",
          ),
        0,
      );
      return;
    }

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
          setStatus(
            error.code ===
              error.PERMISSION_DENIED
              ? "Permission denied"
              : "Waiting for location",
          );
        },
        GEOLOCATION_OPTIONS,
      );

    return () => {
      if (
        watchRef.current !== null
      ) {
        navigator.geolocation.clearWatch(
          watchRef.current,
        );
        watchRef.current = null;
      }
    };
  }, [enabled]);

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
    setCaptureMessage(
      `${target.label} set as target marker.`,
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
        "Target",
      latitude:
        reading.latitude,
      longitude:
        reading.longitude,
      source:
        "current-position",
    });
  };

  const setTargetFromManualInput = () => {
    const latitude =
      parseCoordinateInput(
        targetLatitudeInput,
        -90,
        90,
      );
    const longitude =
      parseCoordinateInput(
        targetLongitudeInput,
        -180,
        180,
      );

    if (
      latitude === null ||
      longitude === null
    ) {
      setCaptureMessage(
        "Enter a valid WGS84 target latitude and longitude.",
      );
      return;
    }

    setTarget({
      id:
        createFieldGpsId(),
      label:
        targetLabelInput.trim() ||
        "Target",
      latitude,
      longitude,
      source:
        "manual",
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
    });
  };

  const toggleTracking = () => {
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

  const recordFoundPoint = () => {
    if (!reading) {
      setCaptureMessage(
        "Waiting for location before recording found point.",
      );
      return;
    }

    if (accuracyBlocked) {
      setCaptureMessage(
        "GPS accuracy is weak. Move to an open area and wait for better accuracy. You may still save this point as approximate.",
      );
      return;
    }

    const targetNote =
      targetPoint
        ? `Found reference for ${targetPoint.label}; target ${formatCoordinate(
            targetPoint.latitude,
          )}, ${formatCoordinate(
            targetPoint.longitude,
          )}${
            targetNavigation
              ? `; final offset ${formatDistance(
                  targetNavigation.distanceMeters,
                )} at ${targetNavigation.bearingDegrees.toFixed(
                  1,
                )} deg`
              : ""
          }.`
        : "Found point recorded without a target marker.";

    const foundPoint =
      createFieldGpsPoint(
        reading,
        nextFoundLabel(
          foundPoints,
        ),
        "single",
        1,
        0,
        targetNote,
      );

    setFoundPoints(
      (current) => [
        ...current,
        foundPoint,
      ],
    );
    setCaptureMessage(
      `${foundPoint.label} found point recorded at ${foundPoint.timestamp}; ${formatCoordinate(
        foundPoint.latitude,
      )}, ${formatCoordinate(
        foundPoint.longitude,
      )}; accuracy ${formatAccuracy(
        foundPoint.accuracyMeters,
      )}.`,
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
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
      >
        Field GPS
      </button>

      {open && (
        <div className="sl-field-gps-card">
          <div className="sl-field-gps-heading">
            <span>Founder Field GPS</span>
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
            <div className="sl-field-gps-actions sl-field-gps-actions-two">
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
                disabled={!reading}
              >
                Record Found Point
              </button>
            </div>

            <div className="sl-field-gps-grid">
              <span>Tracking state</span>
              <strong>
                {tracking
                  ? "Started"
                  : "Stopped"}
              </strong>
              <span>Track fixes</span>
              <strong>
                {trackLog.length}
              </strong>
            </div>
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-heading">
              <span>Target marker</span>
              <strong>
                {targetPoint
                  ? targetPoint.label
                  : "Not set"}
              </strong>
            </div>

            <label className="sl-field-gps-label">
              <span>Target label</span>
              <input
                type="text"
                value={targetLabelInput}
                onChange={(event) =>
                  setTargetLabelInput(
                    event.target.value,
                  )
                }
                placeholder="Target"
              />
            </label>

            <div className="sl-field-gps-target-grid">
              <label className="sl-field-gps-label">
                <span>Target latitude</span>
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
                  placeholder="5.0000000"
                />
              </label>

              <label className="sl-field-gps-label">
                <span>Target longitude</span>
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
                  placeholder="117.0000000"
                />
              </label>
            </div>

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
                onClick={setTargetFromManualInput}
              >
                Set Target
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
                  setCaptureMessage(
                    "Target marker cleared.",
                  );
                }}
                disabled={!targetPoint}
              >
                Clear Target
              </button>
            </div>

            <div className="sl-field-gps-grid">
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
            </div>
          </section>

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
                          onClick={() =>
                            setFoundPoints(
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

          <p className="sl-field-gps-disclaimer">
            {FIELD_GPS_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  );
}
