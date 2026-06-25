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
  bestFixReading,
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

function formatAccuracy(
  accuracy?: number,
): string {
  return accuracy === undefined
    ? "unknown"
    : `${accuracy.toFixed(1)} m`;
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
    points,
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
            <span>Field GPS Advanced</span>
            <strong>
              {points.length} points
            </strong>
          </div>

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
                onClick={() =>
                  setTracking(
                    (current) => !current,
                  )
                }
              >
                {tracking
                  ? "Stop Track"
                  : "Start Track"}
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
                disabled={points.length === 0}
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
                disabled={points.length === 0}
              >
                Export KML
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadTextFile(
                    buildFieldGpsCsv(
                      points,
                    ),
                    `${safeFileName}.csv`,
                    "text/csv",
                  )
                }
                disabled={points.length === 0}
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
                          {formatAccuracy(
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

          <p className="sl-field-gps-disclaimer">
            {FIELD_GPS_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  );
}
