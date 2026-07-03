"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  | "Starting"
  | "Active"
  | "Permission denied"
  | "Not supported"
  | "Failed to start";

type HeadingStatus = "Inactive" | "Requesting" | "Active" | "Denied" | "Unavailable";

type FoundPoint = {
  id: string;
  targetName: string;
  targetLat: number;
  targetLng: number;
  foundLat: number;
  foundLng: number;
  distance: number;
  accuracy: number | null;
  timestamp: string;
  note: string;
};

type WebkitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

function normalizeDeg(value: number) {
  return ((value % 360) + 360) % 360;
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

  return normalizeDeg(toDeg(Math.atan2(y, x)));
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
  if (value < 10) return `${value.toFixed(3)} m`;
  if (value < 100) return `${value.toFixed(2)} m`;
  return `${value.toFixed(1)} m`;
}

function getGpsSignal(gps: GpsFix | null, gpsError: string) {
  if (gpsError || !gps) {
    return {
      level: "lost",
      label: "GPS Lost · Tiada sambungan lokasi",
      detail: gpsError || "No GPS fix",
    };
  }

  const ageSec = (Date.now() - gps.timestamp) / 1000;
  const accuracy = gps.accuracy ?? Number.POSITIVE_INFINITY;

  if (accuracy <= 10 && ageSec <= 15) {
    return {
      level: "strong",
      label: "GPS Active · Signal kuat",
      detail: `±${accuracy.toFixed(1)} m`,
    };
  }

  if (accuracy <= 30 && ageSec <= 30) {
    return {
      level: "weak",
      label: "GPS Weak · Signal lemah",
      detail: `±${accuracy.toFixed(1)} m`,
    };
  }

  return {
    level: "lost",
    label: "GPS Lost · Tiada sambungan lokasi",
    detail: accuracy > 30 ? `Accuracy weak ±${accuracy.toFixed(1)} m` : "GPS update too old",
  };
}

export default function ArStakeoutPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const gpsWatchRef = useRef<number | null>(null);

  const [targetName, setTargetName] = useState("Pt2");
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

  const [heading, setHeading] = useState<number | null>(null);
  const [headingStatus, setHeadingStatus] = useState<HeadingStatus>("Inactive");

  const [arActive, setArActive] = useState(false);
  const [savedPoints, setSavedPoints] = useState<FoundPoint[]>([]);

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

  const relativeArrow = useMemo(() => {
    if (!metrics) return 0;
    if (heading === null) return 0;
    return normalizeDeg(metrics.bearing - heading);
  }, [metrics, heading]);

  function startGps() {
    setGpsError("");

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
      setHeading(normalizeDeg(mobileEvent.webkitCompassHeading));
      setHeadingStatus("Active");
      return;
    }

    if (typeof event.alpha === "number") {
      setHeading(normalizeDeg(360 - event.alpha));
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

    setCameraStatus("Stopped");
  }

  async function requestCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera is not supported in this browser.");
    }

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
        mode: "environment fallback",
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
        return await navigator.mediaDevices.getUserMedia(attempt.constraints);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Camera failed to start.");
  }

  async function startCamera() {
    setCameraStatus("Starting");
    setCameraErrorName("");
    setCameraErrorMessage("");

    try {
      stopCamera();
      setCameraStatus("Starting");

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

        const timeout = window.setTimeout(() => resolve(), 800);
        video.onloadedmetadata = () => {
          window.clearTimeout(timeout);
          resolve();
        };
      });

      await video.play();

      setCameraStatus("Active");
    } catch (error) {
      const err = error as Error & { name?: string };

      setCameraStatus(err?.name === "NotAllowedError" ? "Permission denied" : "Failed to start");
      setCameraErrorName(err?.name || "CameraError");
      setCameraErrorMessage(err?.message || "Camera failed to start.");
      stopCamera();
    }
  }

  async function startArStakeout() {
    setArActive(true);
    if (!gps) startGps();
    await enableHeading();
    await startCamera();
  }

  function stopArStakeout() {
    setArActive(false);
    stopCamera();
  }

  function saveFoundPoint() {
    if (!gps || !target || !metrics) return;

    const record: FoundPoint = {
      id: `${Date.now()}`,
      targetName: target.name,
      targetLat: target.latitude,
      targetLng: target.longitude,
      foundLat: gps.latitude,
      foundLng: gps.longitude,
      distance: metrics.distance,
      accuracy: gps.accuracy,
      timestamp: new Date().toISOString(),
      note,
    };

    setSavedPoints((items) => [record, ...items].slice(0, 10));
    setNote("");
  }

  useEffect(() => {
    return () => {
      stopGps();
      stopCamera();
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  const canSave = Boolean(gps && target && metrics);

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>SabahLot Beta</p>
          <h1>AR Stake Out Lite</h1>
          <p>
            Navigasi awal menggunakan GPS telefon, kamera dan anak panah arah. Bukan penentuan
            sempadan kadaster rasmi.
          </p>
        </div>
        <a className={styles.backLink} href="/">
          ← Back to Map
        </a>
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
              placeholder="contoh 5.980412"
              value={targetLatText}
              onChange={(event) => setTargetLatText(event.target.value)}
            />
          </label>

          <label>
            Longitude
            <input
              inputMode="decimal"
              placeholder="contoh 116.073456"
              value={targetLngText}
              onChange={(event) => setTargetLngText(event.target.value)}
            />
          </label>

          {!target && <p className={styles.warning}>Masukkan koordinat WGS84 decimal degree yang sah.</p>}

          <div className={styles.buttonRow}>
            <button type="button" onClick={startGps}>
              Start GPS
            </button>
            <button type="button" onClick={stopGps}>
              Stop GPS
            </button>
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} onClick={startArStakeout}>
              Start AR Stake Out
            </button>
            <button type="button" onClick={stopArStakeout}>
              Stop AR
            </button>
          </div>

          <button type="button" className={styles.secondaryButton} onClick={startCamera}>
            Test Camera
          </button>

          <label>
            Found point note
            <textarea
              placeholder="Nota ringkas lokasi dijumpai"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>

          <button type="button" disabled={!canSave} onClick={saveFoundPoint}>
            Save Found Point
          </button>
        </div>

        <div className={styles.panel}>
          <h2>Status</h2>

          <div className={`${styles.signalBadge} ${styles[signal.level]}`}>
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
              <dt>Heading</dt>
              <dd>{heading !== null ? `${heading.toFixed(1)}°` : headingStatus}</dd>
            </div>
            <div>
              <dt>Camera</dt>
              <dd>{cameraStatus}</dd>
            </div>
          </dl>

          <div className={styles.diagnostics}>
            <strong>Mobile diagnostic</strong>
            <span>Secure context: {typeof window !== "undefined" && window.isSecureContext ? "yes" : "no"}</span>
            <span>MediaDevices: {typeof navigator !== "undefined" && navigator.mediaDevices ? "yes" : "no"}</span>
            <span>
              getUserMedia:{" "}
              {typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" ? "yes" : "no"}
            </span>
            <span>Camera mode: {cameraMode}</span>
            {cameraErrorName && <span>Error name: {cameraErrorName}</span>}
            {cameraErrorMessage && <span>Error message: {cameraErrorMessage}</span>}
          </div>
        </div>
      </section>

      <section className={styles.arGuide}>
        <video ref={videoRef} className={styles.arVideo} autoPlay muted playsInline />

        <div className={styles.arOverlay}>
          <div className={styles.arTop}>
            <div>
              <p className={styles.kicker}>AR Guide</p>
              <h2>{target?.name || "Target Point"}</h2>
            </div>
            <button type="button" onClick={stopArStakeout}>
              Stop AR Guide
            </button>
          </div>

          <div className={styles.distanceBubble}>{metrics ? formatMeters(metrics.distance) : "-"}</div>

          <div className={styles.guideLine}>
            <span />
            <span />
            <span />
            <span />
          </div>

          <div className={styles.arrowWrap}>
            <div
              className={styles.arrow}
              style={{
                transform: `rotate(${relativeArrow}deg)`,
              }}
            >
              ↑
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
              <span>N</span>
              <strong>{metrics ? formatMeters(metrics.north) : "-"}</strong>
            </div>
            <div>
              <span>E</span>
              <strong>{metrics ? formatMeters(metrics.east) : "-"}</strong>
            </div>
          </div>

          <div className={styles.arStatusRow}>
            <span className={`${styles.signalDot} ${styles[signal.level]}`} />
            <span>{signal.label}</span>
            <span>Camera: {cameraStatus}</span>
            <span>Heading: {heading !== null ? `${heading.toFixed(1)}°` : headingStatus}</span>
          </div>

          {!arActive && <div className={styles.notActive}>Tekan Start AR Stake Out untuk aktifkan kamera.</div>}
        </div>
      </section>

      <section className={styles.disclaimer}>
        Preliminary field navigation only. Not for cadastral boundary determination.
        <br />
        Navigasi awal sahaja. Bukan penentuan sempadan kadaster rasmi.
      </section>

      <section className={styles.panel}>
        <h2>Saved Found Points</h2>
        {savedPoints.length === 0 ? (
          <p>Belum ada rekod.</p>
        ) : (
          <div className={styles.savedList}>
            {savedPoints.map((point) => (
              <article key={point.id}>
                <strong>{point.targetName}</strong>
                <span>Found: {point.foundLat.toFixed(7)}, {point.foundLng.toFixed(7)}</span>
                <span>Distance: {formatMeters(point.distance)}</span>
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
