"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  useRouter,
} from "next/navigation";
import {
  readGpsTargetMemory,
  saveGpsTargetMemory,
} from "@/utils/gpsTargetMemory";
import styles from "./ar-stakeout.module.css";

type GpsFix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number;
};

type CameraStatus =
  | "Stopped"
  | "Requesting permission"
  | "Starting"
  | "Active"
  | "Permission denied"
  | "Not supported"
  | "Failed to start"
  | "Timed out";

type HeadingStatus = "Inactive" | "Requesting" | "Active" | "Denied" | "Unavailable";

type FoundPoint = {
  id: string;
  targetName: string;
  targetLat: number;
  targetLng: number;
  foundLat: number;
  foundLng: number;
  distance: number;
  bearing: number;
  accuracy: number | null;
  timestamp: string;
  note: string;
};

type WebkitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

type RestoredTarget = {
  lat: number;
  lng: number;
  label: string;
  source: "key-in" | "map" | "ar";
  savedAt?: string;
};

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

function normalize360(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeSigned(value: number) {
  return ((value + 540) % 360) - 180;
}

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const earthRadius = 6371008.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lat1: number, lon1: number, lat2: number, lon2: number) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));

  return normalize360(toDeg(Math.atan2(y, x)));
}

function offsetNE(currentLat: number, currentLng: number, targetLat: number, targetLng: number) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(toRad(currentLat));

  return {
    north: (targetLat - currentLat) * metersPerDegLat,
    east: (targetLng - currentLng) * metersPerDegLng,
  };
}

function formatMeters(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) < 10) return `${value.toFixed(3)} m`;
  if (Math.abs(value) < 100) return `${value.toFixed(2)} m`;
  return `${value.toFixed(1)} m`;
}

function bearingToCardinal(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(normalize360(value) / 45) % 8;

  return directions[index];
}

function isValidLatLng(lat: number, lng: number) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function readTargetFromUrlOrMemory(): RestoredTarget | null {
  const params = new URLSearchParams(window.location.search);
  const queryLatText = params.get("targetLat")?.trim() ?? "";
  const queryLngText = params.get("targetLng")?.trim() ?? "";
  const queryLat = queryLatText ? Number(queryLatText) : Number.NaN;
  const queryLng = queryLngText ? Number(queryLngText) : Number.NaN;

  if (isValidLatLng(queryLat, queryLng)) {
    const label = params.get("targetLabel")?.trim() || "Target Point";

    return {
      lat: queryLat,
      lng: queryLng,
      label,
      source: "ar",
      savedAt: `url:${queryLat}:${queryLng}:${label}`,
    };
  }

  const savedTarget = readGpsTargetMemory();

  if (!savedTarget) {
    return null;
  }

  return {
    lat: savedTarget.lat,
    lng: savedTarget.lng,
    label: savedTarget.label?.trim() || "Target Point",
    source: savedTarget.source,
    savedAt: savedTarget.savedAt,
  };
}

function buildMapHref(
  target: {
    name: string;
    latitude: number;
    longitude: number;
  } | null
) {
  if (!target) {
    return "/?restoreTarget=1";
  }

  const params = new URLSearchParams({
    restoreTarget: "1",
    targetLat: String(target.latitude),
    targetLng: String(target.longitude),
    targetLabel: target.name,
  });

  return `/?${params.toString()}`;
}

function getGpsSignal(gps: GpsFix | null, gpsError: string) {
  if (gpsError || !gps) {
    return {
      level: "lost",
      label: "GPS Lost - No location connection",
      detail: gpsError || "No GPS fix",
    };
  }

  const ageSec = (Date.now() - gps.timestamp) / 1000;
  const accuracy = gps.accuracy ?? Number.POSITIVE_INFINITY;

  if (accuracy <= 10 && ageSec <= 15) {
    return {
      level: "strong",
      label: "GPS Active - Strong signal",
      detail: `±${accuracy.toFixed(1)} m`,
    };
  }

  if (accuracy <= 30 && ageSec <= 30) {
    return {
      level: "weak",
      label: "GPS Weak - Weak signal",
      detail: `±${accuracy.toFixed(1)} m`,
    };
  }

  return {
    level: "lost",
    label: "GPS Lost - No location connection",
    detail: accuracy > 30 ? `Accuracy weak ±${accuracy.toFixed(1)} m` : "GPS update too old",
  };
}

function cameraMessage(errorName: string, fallback: string) {
  if (errorName === "NotAllowedError") {
    return "Camera permission denied. Allow Camera permission in browser site settings.";
  }

  if (errorName === "NotReadableError") {
    return "Camera is busy or used by another app. Close camera apps and try again.";
  }

  if (errorName === "NotFoundError") {
    return "No camera found on this device.";
  }

  if (errorName === "OverconstrainedError") {
    return "Rear camera constraint failed. SabahLot will try fallback camera.";
  }

  return fallback;
}

export default function ArStakeoutPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const gpsWatchRef = useRef<number | null>(null);

  const [targetName, setTargetName] = useState("Target Point");
  const [targetLatText, setTargetLatText] = useState("");
  const [targetLngText, setTargetLngText] = useState("");
  const [note, setNote] = useState("");

  const [gps, setGps] = useState<GpsFix | null>(null);
  const [gpsStatus, setGpsStatus] = useState("GPS stopped");
  const [gpsError, setGpsError] = useState("");

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("Stopped");
  const [cameraErrorName, setCameraErrorName] = useState("");
  const [cameraErrorMessage, setCameraErrorMessage] = useState("");
  const [cameraMode, setCameraMode] = useState("not started");
  const [videoReady, setVideoReady] = useState(false);

  const [heading, setHeading] = useState<number | null>(null);
  const [headingStatus, setHeadingStatus] = useState<HeadingStatus>("Inactive");

  const [arActive, setArActive] = useState(false);
  const [fieldMessage, setFieldMessage] = useState("");
  const [savedPoints, setSavedPoints] = useState<FoundPoint[]>([]);

  const secureContext =
    typeof window !== "undefined" && window.isSecureContext ? "yes" : "no";
  const mediaDevicesSupport =
    typeof navigator !== "undefined" && navigator.mediaDevices ? "yes" : "no";
  const getUserMediaSupport =
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function"
      ? "yes"
      : "no";

  const target = useMemo(() => {
    const lat = Number(targetLatText);
    const lng = Number(targetLngText);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

    return {
      name: targetName.trim() || "Target Point",
      latitude: lat,
      longitude: lng,
    };
  }, [targetName, targetLatText, targetLngText]);

  const backToMapHref = useMemo(() => buildMapHref(target), [target]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const restoredTarget = readTargetFromUrlOrMemory();

      if (!restoredTarget) {
        return;
      }

      setTargetName(restoredTarget.label);
      setTargetLatText(String(restoredTarget.lat));
      setTargetLngText(String(restoredTarget.lng));
      saveGpsTargetMemory({
        lat: restoredTarget.lat,
        lng: restoredTarget.lng,
        label: restoredTarget.label,
        source: restoredTarget.source,
        savedAt: restoredTarget.savedAt,
      });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  const metrics = useMemo(() => {
    if (!gps || !target) return null;

    const distance = distanceMeters(gps.latitude, gps.longitude, target.latitude, target.longitude);
    const bearing = bearingDeg(gps.latitude, gps.longitude, target.latitude, target.longitude);
    const offset = offsetNE(gps.latitude, gps.longitude, target.latitude, target.longitude);

    return {
      distance,
      bearing,
      north: offset.north,
      east: offset.east,
    };
  }, [gps, target]);

  const signal = getGpsSignal(gps, gpsError);

  const relativeAngle = useMemo(() => {
    if (!metrics || heading === null) return null;
    return normalizeSigned(metrics.bearing - heading);
  }, [metrics, heading]);

  const directionText = useMemo(() => {
    if (!target) return "Enter valid target coordinate.";
    if (!gps) return "Start GPS first.";
    if (!metrics) return "Waiting for navigation data.";

    if (heading === null || relativeAngle === null) {
      return `Compass heading unavailable. Bearing to target: ${metrics.bearing.toFixed(1)}°`;
    }

    if (Math.abs(relativeAngle) <= 15) return "Face target";
    if (relativeAngle > 15) return `Turn right ${Math.abs(relativeAngle).toFixed(0)}°`;
    return `Turn left ${Math.abs(relativeAngle).toFixed(0)}°`;
  }, [target, gps, metrics, heading, relativeAngle]);

  function startGps() {
    setGpsError("");
    setFieldMessage("");

    if (!("geolocation" in navigator)) {
      setGpsStatus("GPS not supported");
      setGpsError("Browser geolocation is not supported.");
      return;
    }

    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }

    setGpsStatus("Locating GPS...");

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setGps({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
          altitude: position.coords.altitude ?? null,
          altitudeAccuracy: position.coords.altitudeAccuracy ?? null,
          heading: position.coords.heading ?? null,
          speed: position.coords.speed ?? null,
          timestamp: position.timestamp,
        });
        setGpsStatus("GPS active");
        setGpsError("");
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Permission denied. Allow Location permission."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Position unavailable."
              : error.code === error.TIMEOUT
                ? "GPS timeout."
                : error.message;

        setGpsStatus("GPS error");
        setGpsError(message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      }
    );
  }

  function stopGps() {
    if (gpsWatchRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }

    setGpsStatus(gps ? "GPS stopped · last fix retained" : "GPS stopped");
  }

  function handleOrientation(event: DeviceOrientationEvent) {
    const mobileEvent = event as WebkitOrientationEvent;

    if (typeof mobileEvent.webkitCompassHeading === "number") {
      setHeading(normalize360(mobileEvent.webkitCompassHeading));
      setHeadingStatus("Active");
      return;
    }

    if (typeof event.alpha === "number") {
      setHeading(normalize360(360 - event.alpha));
      setHeadingStatus("Active");
      return;
    }

    setHeadingStatus("Unavailable");
  }

  async function enableHeading() {
    setHeadingStatus("Requesting");

    try {
      const DeviceOrientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
        requestPermission?: () => Promise<"granted" | "denied" | "default">;
      };

      if (DeviceOrientation?.requestPermission) {
        const permission = await DeviceOrientation.requestPermission();

        if (permission !== "granted") {
          setHeadingStatus("Denied");
          return;
        }
      }

      window.addEventListener("deviceorientation", handleOrientation, true);
      setHeadingStatus("Active");
    } catch {
      setHeadingStatus("Unavailable");
    }
  }

  function stopCamera() {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }

    setVideoReady(false);
    setCameraStatus("Stopped");
  }

  async function getUserMediaWithTimeout(
    constraints: MediaStreamConstraints,
    timeoutMs: number
  ): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported in this browser.");
    }

    const cameraPromise = navigator.mediaDevices.getUserMedia(constraints);

    const timeoutPromise = new Promise<never>((_, reject) => {
      window.setTimeout(() => {
        const error = new Error(
          "Camera permission request timed out. Please allow camera permission or reopen in Chrome/Safari."
        );
        error.name = "TimeoutError";
        reject(error);
      }, timeoutMs);
    });

    return Promise.race([cameraPromise, timeoutPromise]);
  }

  async function requestCameraStream() {
    const attempts: Array<{
      mode: string;
      constraints: MediaStreamConstraints;
    }> = [
      {
        mode: "environment ideal",
        constraints: {
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        },
      },
      {
        mode: "environment",
        constraints: {
          video: {
            facingMode: "environment",
          },
          audio: false,
        },
      },
      {
        mode: "any camera",
        constraints: {
          video: true,
          audio: false,
        },
      },
    ];

    let lastError: unknown = null;

    for (const attempt of attempts) {
      try {
        setCameraMode(attempt.mode);
        return await getUserMediaWithTimeout(attempt.constraints, 12000);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Camera failed to start.");
  }

  async function startCamera() {
    setCameraStatus("Requesting permission");
    setCameraErrorName("");
    setCameraErrorMessage("");
    setVideoReady(false);
    setFieldMessage("");

    try {
      stopCamera();
      setCameraStatus("Starting");

      if (secureContext !== "yes") {
        throw new Error("Camera requires HTTPS. Please open https://beta.sabahlot.com");
      }

      if (getUserMediaSupport !== "yes") {
        const error = new Error(
          "Camera is not supported in this browser. Open beta.sabahlot.com in Chrome Android or Safari iPhone."
        );
        error.name = "NotSupportedError";
        throw error;
      }

      const stream = await requestCameraStream();
      cameraStreamRef.current = stream;

      const video = videoRef.current;

      if (!video) {
        throw new Error("Video element is not ready.");
      }

      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.setAttribute("playsinline", "true");
      video.setAttribute("webkit-playsinline", "true");
      video.setAttribute("autoplay", "true");
      video.setAttribute("muted", "true");
      video.srcObject = stream;

      await new Promise<void>((resolve) => {
        if (video.readyState >= 1) {
          resolve();
          return;
        }

        const timeout = window.setTimeout(() => resolve(), 1000);
        video.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });

      await video.play();

      setVideoReady(true);
      setCameraStatus("Active");
    } catch (error) {
      const err = error as Error & { name?: string };

      const name = err?.name || "CameraError";
      const message = cameraMessage(name, err?.message || "Camera failed to start.");

      setCameraStatus(
        name === "NotAllowedError"
          ? "Permission denied"
          : name === "NotSupportedError"
            ? "Not supported"
            : name === "TimeoutError"
              ? "Timed out"
              : "Failed to start"
      );
      setCameraErrorName(name);
      setCameraErrorMessage(message);
      setFieldMessage(message);
      stopCamera();
    }
  }

  async function testCamera() {
    setArActive(false);
    await startCamera();
  }

  async function startArGuide() {
    if (!target) {
      setFieldMessage("Enter valid target coordinate first.");
      return;
    }

    saveGpsTargetMemory({
      lat: target.latitude,
      lng: target.longitude,
      label: target.name,
      source: "ar",
    });

    if (!gps) {
      setFieldMessage("Start GPS first before AR Guide.");
      return;
    }

    setFieldMessage("");
    setArActive(true);

    await enableHeading();
    await startCamera();
  }

  function stopArGuide() {
    setArActive(false);
    stopCamera();
  }

  function saveFoundPoint() {
    if (!gps || !target || !metrics) {
      setFieldMessage("Start GPS and enter target coordinate first.");
      return;
    }

    const record: FoundPoint = {
      id: `${Date.now()}`,
      targetName: target.name,
      targetLat: target.latitude,
      targetLng: target.longitude,
      foundLat: gps.latitude,
      foundLng: gps.longitude,
      distance: metrics.distance,
      bearing: metrics.bearing,
      accuracy: gps.accuracy,
      timestamp: new Date().toISOString(),
      note,
    };

    setSavedPoints((items) => [record, ...items].slice(0, 10));
    setNote("");
    setFieldMessage("Found point saved locally as preliminary record.");
  }

  useEffect(() => {
    return () => {
      if (gpsWatchRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchRef.current);
      }

      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  const canSave = Boolean(gps && target && metrics);
  const arrowRotation = heading !== null && relativeAngle !== null ? relativeAngle : 0;
  const targetDirection = metrics ? bearingToCardinal(metrics.bearing) : "-";
  const headingDirection = heading !== null ? bearingToCardinal(heading) : "-";

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>SabahLot Beta</p>
          <h1>AR Guide</h1>
          <p>
            Preliminary Field Assist using phone GPS, camera, and directional arrow.
          </p>
        </div>
        <button
          type="button"
          className={styles.backLink}
          onClick={() => {
            if (target) {
              saveGpsTargetMemory({
                lat: target.latitude,
                lng: target.longitude,
                label: target.name,
                source: "ar",
              });
              router.push(backToMapHref);
              return;
            }

            const savedTarget =
              readGpsTargetMemory();

            if (savedTarget) {
              router.push(
                buildMapHref({
                  name:
                    savedTarget.label ||
                    "AR Guide Target",
                  latitude:
                    savedTarget.lat,
                  longitude:
                    savedTarget.lng,
                }),
              );
              return;
            }

            router.push(
              "/?restoreTarget=1",
            );
          }}
        >
          ← Back to Map
        </button>
      </section>

      <section className={styles.grid}>
        <div className={styles.panel}>
          <h2>Target Coordinate</h2>

          <label>
            Point name
            <input value={targetName} onChange={(event) => setTargetName(event.target.value)} />
          </label>

          <label>
            Latitude
            <input
              inputMode="decimal"
              placeholder="example 5.980412"
              value={targetLatText}
              onChange={(event) => setTargetLatText(event.target.value)}
            />
          </label>

          <label>
            Longitude
            <input
              inputMode="decimal"
              placeholder="example 116.073456"
              value={targetLngText}
              onChange={(event) => setTargetLngText(event.target.value)}
            />
          </label>

          {!target && (
            <p className={styles.warning}>Enter a valid WGS84 decimal degree coordinate.</p>
          )}

          <div className={styles.buttonRow}>
            <button type="button" onClick={startGps}>
              Start GPS
            </button>
            <button type="button" onClick={stopGps}>
              Stop GPS
            </button>
          </div>

          <button type="button" className={styles.secondaryButton} onClick={testCamera}>
            Test Camera
          </button>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} onClick={startArGuide}>
              Start AR Guide
            </button>
            <button type="button" onClick={stopArGuide}>
              Stop AR
            </button>
          </div>

          <label>
            Found point note
            <textarea
              placeholder="Brief note for found location"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button type="button" disabled={!canSave} onClick={saveFoundPoint}>
            Save Found Point
          </button>

          {fieldMessage && <p className={styles.fieldMessage}>{fieldMessage}</p>}
        </div>

        <div className={styles.panel}>
          <h2>Status & Diagnostic</h2>

          <div className={`${styles.signalBadge} ${styles[signal.level] ?? ""}`}>
            <span>{signal.label}</span>
            <strong>{signal.detail}</strong>
          </div>

          <dl className={styles.statusList}>
            <div>
              <dt>GPS status</dt>
              <dd>{gpsStatus}</dd>
            </div>
            <div>
              <dt>Latitude</dt>
              <dd>{gps ? gps.latitude.toFixed(7) : "-"}</dd>
            </div>
            <div>
              <dt>Longitude</dt>
              <dd>{gps ? gps.longitude.toFixed(7) : "-"}</dd>
            </div>
            <div>
              <dt>Accuracy</dt>
              <dd>{gps?.accuracy ? `±${gps.accuracy.toFixed(1)} m` : "-"}</dd>
            </div>
            <div>
              <dt>Bearing</dt>
              <dd>{metrics ? `${metrics.bearing.toFixed(1)}° ${targetDirection}` : "-"}</dd>
            </div>
            <div>
              <dt>Heading</dt>
              <dd>{heading !== null ? `${heading.toFixed(1)}° ${headingDirection}` : headingStatus}</dd>
            </div>
            <div>
              <dt>Direction</dt>
              <dd>{directionText}</dd>
            </div>
            <div>
              <dt>Camera</dt>
              <dd>{cameraStatus}</dd>
            </div>
          </dl>

          <div className={styles.diagnostics}>
            <strong>Mobile diagnostic</strong>
            <span suppressHydrationWarning>Secure context: {secureContext}</span>
            <span suppressHydrationWarning>MediaDevices: {mediaDevicesSupport}</span>
            <span suppressHydrationWarning>getUserMedia: {getUserMediaSupport}</span>
            <span suppressHydrationWarning>Camera mode: {cameraMode}</span>
            <span>Video ready: {videoReady ? "yes" : "no"}</span>
            {cameraErrorName && <span>Error name: {cameraErrorName}</span>}
            {cameraErrorMessage && <span>Error message: {cameraErrorMessage}</span>}
          </div>
        </div>
      </section>

      <section className={`${styles.stage} ${arActive ? styles.stageFullscreen : ""}`}>
        <video ref={videoRef} className={styles.arVideo} autoPlay muted playsInline />

        <div className={styles.arOverlay}>
          <div className={styles.arTop}>
            <div>
              <p className={styles.kicker}>AR Guide</p>
              <h2>{target?.name || "Target Point"}</h2>
              <p>{directionText}</p>
            </div>
            <button type="button" onClick={stopArGuide}>
              Stop AR
            </button>
          </div>

          <div className={styles.targetDot} />
          <div className={styles.distanceBubble}>{metrics ? formatMeters(metrics.distance) : "-"}</div>

          <div className={styles.guideLine}>
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className={styles.arrowWrap}>
            <div className={styles.compassRose} aria-label="Compass direction reference">
              <span className={styles.compassN}>N</span>
              <span className={styles.compassNE}>NE</span>
              <span className={styles.compassE}>E</span>
              <span className={styles.compassSE}>SE</span>
              <span className={styles.compassS}>S</span>
              <span className={styles.compassSW}>SW</span>
              <span className={styles.compassW}>W</span>
              <span className={styles.compassNW}>NW</span>

              <div
                className={styles.arrow}
                style={{
                  transform: `rotate(${arrowRotation}deg)`,
                }}
              >
                ↑
              </div>
            </div>
          </div>

          <div className={styles.bottomStrip}>
            <div>
              <span>Target</span>
              <strong>{target?.name || "-"}</strong>
            </div>
            <div>
              <span>Distance</span>
              <strong>{metrics ? formatMeters(metrics.distance) : "-"}</strong>
            </div>
            <div>
              <span>Bearing</span>
              <strong>{metrics ? `${metrics.bearing.toFixed(1)}° ${targetDirection}` : "-"}</strong>
            </div>
            <div>
              <span>N / E</span>
              <strong>
                {metrics ? `${formatMeters(metrics.north)} / ${formatMeters(metrics.east)}` : "-"}
              </strong>
            </div>
          </div>

          <div className={styles.arStatusRow}>
            <span className={`${styles.signalDot} ${styles[signal.level] ?? ""}`} />
            <span>{signal.label}</span>
            <span>Camera: {cameraStatus}</span>
            <span>Heading: {heading !== null ? `${heading.toFixed(1)}° ${headingDirection}` : headingStatus}</span>
            <span>Video: {videoReady ? "ready" : "not ready"}</span>
          </div>

          {!videoReady && cameraStatus === "Active" && (
            <div className={styles.videoWarning}>
              Camera stream active but video frame is not visible. Try Test Camera again or reopen
              this page in Chrome/Safari.
            </div>
          )}

          {!arActive && (
            <div className={styles.notActive}>
              Tap Test Camera to test the camera or Start AR Guide for find point guidance.
            </div>
          )}
        </div>
      </section>

      <section className={styles.disclaimer}>
        Preliminary Field Assist navigation only.
      </section>

      <section className={styles.panel}>
        <h2>Saved Found Points</h2>
        {savedPoints.length === 0 ? (
          <p>No records yet.</p>
        ) : (
          <div className={styles.savedList}>
            {savedPoints.map((point) => (
              <article key={point.id}>
                <strong>{point.targetName}</strong>
                <span>
                  Found: {point.foundLat.toFixed(7)}, {point.foundLng.toFixed(7)}
                </span>
                <span>Distance: {formatMeters(point.distance)}</span>
                <span>Bearing: {point.bearing.toFixed(1)}°</span>
                <span>Accuracy: {point.accuracy ? `±${point.accuracy.toFixed(1)} m` : "-"}</span>
                <span>{point.timestamp}</span>
                {point.note && <span>Note: {point.note}</span>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}





