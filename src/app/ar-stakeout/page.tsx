"use client";
import Link from "next/link";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type ActiveTarget = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
};

type SavedStakeOutTarget = ActiveTarget & {
  lastUsedAt?: string;
};

type TargetDraft = {
  name: string;
  lat: number;
  lng: number;
};

type WebkitOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
};

const ACTIVE_TARGET_STORAGE_KEY = "sabahlot.arStakeout.activeTarget";
const SAVED_TARGETS_STORAGE_KEY = "sabahlot.arStakeout.savedTargets";
const AR_FOV_DEG = 60;
const AR_MARKER_EDGE_OFFSET_PERCENT = 45;
const ON_TARGET_DEG = 7;
const TARGET_BEHIND_DEG = 150;

const toRad = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalize360(value: number) {
  return ((value % 360) + 360) % 360;
}

function normalizeRelativeBearing(value: number) {
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

function formatDegrees(value: number, decimals = 1) {
  return `${value.toFixed(decimals)}\u00b0`;
}

function formatAccuracy(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return `\u00b1${value.toFixed(1)} m`;
}

function isValidActiveTarget(value: unknown): value is ActiveTarget {
  if (!value || typeof value !== "object") return false;

  const target = value as Partial<ActiveTarget>;

  return (
    typeof target.id === "string" &&
    typeof target.name === "string" &&
    typeof target.lat === "number" &&
    Number.isFinite(target.lat) &&
    target.lat >= -90 &&
    target.lat <= 90 &&
    typeof target.lng === "number" &&
    Number.isFinite(target.lng) &&
    target.lng >= -180 &&
    target.lng <= 180 &&
    typeof target.createdAt === "string" &&
    typeof target.updatedAt === "string"
  );
}

function activeTargetFromText(
  targetNameText: string,
  targetLatValue: string,
  targetLngValue: string
): TargetDraft | null {
  const lat = Number(targetLatValue);
  const lng = Number(targetLngValue);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return {
    name: targetNameText.trim() || "Target Point",
    lat,
    lng,
  };
}

function createTargetId() {
  return `target-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function targetFromDraft(draft: TargetDraft, existingTarget?: ActiveTarget | null): ActiveTarget {
  const now = new Date().toISOString();

  return {
    id: existingTarget?.id || createTargetId(),
    name: draft.name,
    lat: draft.lat,
    lng: draft.lng,
    createdAt: existingTarget?.createdAt || now,
    updatedAt: now,
  };
}

function isSavedStakeOutTarget(value: unknown): value is SavedStakeOutTarget {
  if (!isValidActiveTarget(value)) return false;

  const target = value as Partial<SavedStakeOutTarget>;

  return target.lastUsedAt === undefined || typeof target.lastUsedAt === "string";
}

function isSameSavedTarget(a: Pick<ActiveTarget, "name" | "lat" | "lng">, b: Pick<ActiveTarget, "name" | "lat" | "lng">) {
  return (
    a.name.trim().toLowerCase() === b.name.trim().toLowerCase() &&
    Math.abs(a.lat - b.lat) < 0.0000001 &&
    Math.abs(a.lng - b.lng) < 0.0000001
  );
}

function isSabahLikeCoordinate(lat: number, lng: number) {
  return lat >= 4 && lat <= 7 && lng >= 115 && lng <= 119;
}

function bearingToCardinal(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";

  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(normalize360(value) / 45) % 8;

  return directions[index];
}

function getGpsSignal(gps: GpsFix | null, gpsError: string) {
  if (gpsError || !gps) {
    return {
      level: "lost",
      label: "GPS Lost - Tiada sambungan lokasi",
      detail: gpsError || "No GPS fix",
    };
  }

  const ageSec = (Date.now() - gps.timestamp) / 1000;
  const accuracy = gps.accuracy ?? Number.POSITIVE_INFINITY;

  if (accuracy <= 10 && ageSec <= 15) {
    return {
      level: "strong",
      label: "GPS Active - Signal kuat",
      detail: formatAccuracy(accuracy),
    };
  }

  if (accuracy <= 30 && ageSec <= 30) {
    return {
      level: "weak",
      label: "GPS Weak - Signal lemah",
      detail: formatAccuracy(accuracy),
    };
  }

  return {
    level: "lost",
    label: "GPS Lost - Tiada sambungan lokasi",
    detail: accuracy > 30 ? `Accuracy weak ${formatAccuracy(accuracy)}` : "GPS update too old",
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const gpsWatchRef = useRef<number | null>(null);
  const targetPanelRef = useRef<HTMLDivElement | null>(null);

  const [targetName, setTargetName] = useState("Pt2");
  const [targetLatText, setTargetLatText] = useState("");
  const [targetLngText, setTargetLngText] = useState("");
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null);
  const [note, setNote] = useState("");
  const [findPointVisible, setFindPointVisible] = useState(false);

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
  const [savedTargets, setSavedTargets] = useState<SavedStakeOutTarget[]>([]);

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
    return activeTargetFromText(targetName, targetLatText, targetLngText);
  }, [targetName, targetLatText, targetLngText]);

  const targetValidationMessage = useMemo(() => {
    if (!targetLatText.trim() && !targetLngText.trim()) {
      return "Enter target coordinate, then press Set Active Target.";
    }

    if (!targetLatText.trim() || !targetLngText.trim()) {
      return "Latitude and longitude are required.";
    }

    const lat = Number(targetLatText);
    const lng = Number(targetLngText);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return "Latitude and longitude must be numbers.";
    }

    if (lat < -90 || lat > 90) {
      return "Latitude must be between -90 and 90.";
    }

    if (lng < -180 || lng > 180) {
      return "Longitude must be between -180 and 180.";
    }

    return "";
  }, [targetLatText, targetLngText]);

  const sabahWarning =
    target && !isSabahLikeCoordinate(target.lat, target.lng)
      ? "Coordinate may be outside Sabah or lat/lng may be swapped."
      : "";

  const metrics = useMemo(() => {
    if (!gps || !activeTarget) return null;

    const distance = distanceMeters(
      gps.latitude,
      gps.longitude,
      activeTarget.lat,
      activeTarget.lng
    );
    const bearing = bearingDeg(
      gps.latitude,
      gps.longitude,
      activeTarget.lat,
      activeTarget.lng
    );
    const offset = offsetNE(
      gps.latitude,
      gps.longitude,
      activeTarget.lat,
      activeTarget.lng
    );

    return {
      distance,
      bearing,
      north: offset.north,
      east: offset.east,
    };
  }, [gps, activeTarget]);

  const signal = getGpsSignal(gps, gpsError);

  const relativeBearing = useMemo(() => {
    if (!metrics || heading === null) return null;
    return normalizeRelativeBearing(metrics.bearing - heading);
  }, [metrics, heading]);

  const directionText = useMemo(() => {
    if (!activeTarget) return "Please enter target coordinate first.";
    if (!gps) return "Start GPS first.";
    if (!metrics) return "Waiting for navigation data.";

    if (heading === null || relativeBearing === null) {
      return `Compass heading unavailable. Bearing to target: ${formatDegrees(metrics.bearing)}`;
    }

    const absoluteRelativeBearing = Math.abs(relativeBearing);

    if (absoluteRelativeBearing <= ON_TARGET_DEG) return "On target direction";
    if (absoluteRelativeBearing >= TARGET_BEHIND_DEG) return "Turn around - target behind";
    if (relativeBearing > 0) return `Turn right ${formatDegrees(absoluteRelativeBearing, 0)}`;
    return `Turn left ${formatDegrees(absoluteRelativeBearing, 0)}`;
  }, [activeTarget, gps, metrics, heading, relativeBearing]);

  const persistActiveTarget = useCallback((nextTarget: ActiveTarget) => {
    try {
      localStorage.setItem(ACTIVE_TARGET_STORAGE_KEY, JSON.stringify(nextTarget));
    } catch {
      // Active target still works for this page if storage is blocked.
    }
  }, []);

  const persistSavedTargets = useCallback((targets: SavedStakeOutTarget[]) => {
    try {
      localStorage.setItem(SAVED_TARGETS_STORAGE_KEY, JSON.stringify(targets));
    } catch {
      // Saved targets remain available until refresh if storage is blocked.
    }
  }, []);

  const applyTarget = useCallback((nextTarget: ActiveTarget) => {
    setTargetName(nextTarget.name);
    setTargetLatText(`${nextTarget.lat}`);
    setTargetLngText(`${nextTarget.lng}`);
    setActiveTarget(nextTarget);
    persistActiveTarget(nextTarget);
    setFindPointVisible(false);
    setFieldMessage("");
  }, [persistActiveTarget]);

  useEffect(() => {
    let restoredTarget: ActiveTarget | null = null;
    let restoreTimer: number | null = null;
    let libraryTimer: number | null = null;
    const params = new URLSearchParams(window.location.search);
    const queryLat = Number(params.get("lat"));
    const queryLng = Number(params.get("lng"));

    if (Number.isFinite(queryLat) && Number.isFinite(queryLng)) {
      const queryDraft = activeTargetFromText(
        params.get("name")?.trim() || "Target Point",
        `${queryLat}`,
        `${queryLng}`
      );

      if (queryDraft) {
        restoredTarget = targetFromDraft(queryDraft);
      }
    }

    if (!restoredTarget) {
      try {
        const storedTarget = localStorage.getItem(ACTIVE_TARGET_STORAGE_KEY);
        const parsedTarget = storedTarget ? JSON.parse(storedTarget) : null;

        if (isValidActiveTarget(parsedTarget)) {
          restoredTarget = parsedTarget;
        }
      } catch {
        localStorage.removeItem(ACTIVE_TARGET_STORAGE_KEY);
      }
    }

    try {
      const storedTargets = localStorage.getItem(SAVED_TARGETS_STORAGE_KEY);
      const parsedTargets = storedTargets ? JSON.parse(storedTargets) : null;

      if (Array.isArray(parsedTargets)) {
        const validTargets = parsedTargets.filter(isSavedStakeOutTarget);

        libraryTimer = window.setTimeout(() => {
          setSavedTargets(validTargets);
        }, 0);
      }
    } catch {
      localStorage.removeItem(SAVED_TARGETS_STORAGE_KEY);
    }

    if (restoredTarget) {
      const targetToRestore = restoredTarget;
      restoreTimer = window.setTimeout(() => {
        applyTarget(targetToRestore);
      }, 0);
    }

    return () => {
      if (restoreTimer !== null) {
        window.clearTimeout(restoreTimer);
      }

      if (libraryTimer !== null) {
        window.clearTimeout(libraryTimer);
      }
    };
  }, [applyTarget]);

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

    setGpsStatus(gps ? "GPS stopped - last fix retained" : "GPS stopped");
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

  function returnToTargetInput(message?: string) {
    setArActive(false);

    if (message) {
      setFieldMessage(message);
    }

    window.setTimeout(() => {
      targetPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function setActiveTargetFromDraft() {
    if (!target) {
      setFieldMessage(targetValidationMessage || "Please enter target coordinate first.");
      return;
    }

    const nextTarget = targetFromDraft(target, activeTarget);

    applyTarget(nextTarget);
    setFieldMessage("Active target set.");
  }

  function findPoint() {
    if (!gps) {
      setFieldMessage("Start GPS first before Find Point.");
      return;
    }

    if (!activeTarget) {
      returnToTargetInput("Please enter target coordinate first.");
      return;
    }

    setFindPointVisible(true);
    setFieldMessage("");
  }

  async function startArStakeout() {
    if (!activeTarget) {
      returnToTargetInput("Please enter target coordinate first.");
      return;
    }

    if (!gps) {
      setFieldMessage("Start GPS first before AR Stake Out.");
      return;
    }

    setFieldMessage("");
    setArActive(true);

    await enableHeading();
    await startCamera();
  }

  function stopArStakeout() {
    setArActive(false);
    stopCamera();
  }

  function editTarget() {
    stopCamera();
    returnToTargetInput();
  }

  function saveTargetToLibrary(targetToSave: ActiveTarget) {
    const now = new Date().toISOString();
    const savedTarget: SavedStakeOutTarget = {
      ...targetToSave,
      updatedAt: now,
    };
    const duplicate = savedTargets.find((item) => isSameSavedTarget(item, savedTarget));

    if (duplicate) {
      setFieldMessage("Target already saved.");
      return;
    }

    const sameNameIndex = savedTargets.findIndex(
      (item) => item.name.trim().toLowerCase() === savedTarget.name.trim().toLowerCase()
    );
    const nextTargets =
      sameNameIndex >= 0
        ? savedTargets.map((item, index) =>
            index === sameNameIndex
              ? {
                  ...savedTarget,
                  id: item.id,
                  createdAt: item.createdAt,
                }
              : item
          )
        : [savedTarget, ...savedTargets];
    const resultMessage = sameNameIndex >= 0 ? "Saved target updated." : "Target saved.";

    setSavedTargets(nextTargets);
    persistSavedTargets(nextTargets);
    setFieldMessage(resultMessage);
  }

  function saveActiveTarget() {
    if (activeTarget) {
      saveTargetToLibrary(activeTarget);
      return;
    }

    if (!target) {
      setFieldMessage(targetValidationMessage || "Please enter target coordinate first.");
      return;
    }

    const nextTarget = targetFromDraft(target);

    applyTarget(nextTarget);
    saveTargetToLibrary(nextTarget);
  }

  function saveDraftTarget() {
    if (!target) {
      setFieldMessage(targetValidationMessage || "Please enter target coordinate first.");
      return;
    }

    const nextTarget = targetFromDraft(target, activeTarget);

    applyTarget(nextTarget);
    saveTargetToLibrary(nextTarget);
  }

  function applySavedTarget(savedTarget: SavedStakeOutTarget) {
    const now = new Date().toISOString();
    const nextTarget: ActiveTarget = {
      id: savedTarget.id,
      name: savedTarget.name,
      lat: savedTarget.lat,
      lng: savedTarget.lng,
      createdAt: savedTarget.createdAt,
      updatedAt: now,
    };
    const nextSavedTargets = savedTargets.map((item) =>
      item.id === savedTarget.id ? { ...item, lastUsedAt: now, updatedAt: now } : item
    );

    setSavedTargets(nextSavedTargets);
    persistSavedTargets(nextSavedTargets);
    applyTarget(nextTarget);
    setFieldMessage("Saved target selected.");
    returnToTargetInput();
  }

  function stakeOutSavedTarget(savedTarget: SavedStakeOutTarget) {
    const now = new Date().toISOString();
    const nextTarget: ActiveTarget = {
      id: savedTarget.id,
      name: savedTarget.name,
      lat: savedTarget.lat,
      lng: savedTarget.lng,
      createdAt: savedTarget.createdAt,
      updatedAt: now,
    };
    const nextSavedTargets = savedTargets.map((item) =>
      item.id === savedTarget.id ? { ...item, lastUsedAt: now, updatedAt: now } : item
    );

    setSavedTargets(nextSavedTargets);
    persistSavedTargets(nextSavedTargets);
    applyTarget(nextTarget);

    if (gps) {
      setFindPointVisible(true);
      setFieldMessage("Saved target ready for stake out.");
      return;
    }

    setFieldMessage("Saved target selected. Start GPS before Find Point or AR Guide.");
  }

  function deleteSavedTarget(targetId: string) {
    const nextTargets = savedTargets.filter((item) => item.id !== targetId);

    setSavedTargets(nextTargets);
    persistSavedTargets(nextTargets);
    setFieldMessage("Saved target deleted.");
  }

  function saveFoundPoint() {
    if (!gps || !activeTarget || !metrics) {
      setFieldMessage("Start GPS and enter target coordinate first.");
      return;
    }

    const record: FoundPoint = {
      id: `${Date.now()}`,
      targetName: activeTarget.name,
      targetLat: activeTarget.lat,
      targetLng: activeTarget.lng,
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

  const canSave = Boolean(gps && activeTarget && metrics);
  const markerOffsetPercent =
    relativeBearing !== null
      ? clamp(
          (relativeBearing / (AR_FOV_DEG / 2)) * AR_MARKER_EDGE_OFFSET_PERCENT,
          -AR_MARKER_EDGE_OFFSET_PERCENT,
          AR_MARKER_EDGE_OFFSET_PERCENT
        )
      : 0;
  const markerLeftPercent = 50 + markerOffsetPercent;
  const markerStyle = { left: `${markerLeftPercent}%` };
  const bubbleStyle = {
    left: `clamp(72px, ${markerLeftPercent}%, calc(100% - 72px))`,
  };
  const targetOutsideFov = relativeBearing !== null && Math.abs(relativeBearing) > AR_FOV_DEG / 2;
  const arrowRotation = heading !== null && relativeBearing !== null ? relativeBearing : 0;
  const targetDirection = metrics ? bearingToCardinal(metrics.bearing) : "-";
  const headingDirection = heading !== null ? bearingToCardinal(heading) : "-";

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>SabahLot Beta</p>
          <h1>AR Stake Out Lite</h1>
          <p>
            Navigasi awal menggunakan GPS telefon, kamera dan anak panah. Bukan penentuan
            sempadan kadaster rasmi.
          </p>
        </div>
        <Link className={styles.backLink} href="/">
          Back to Map
        </Link>
      </section>

      <section className={styles.grid}>
        <div ref={targetPanelRef} className={`${styles.panel} ${styles.targetPanel}`}>
          <h2>Target Coordinate</h2>

          <label>
            Point name
            <input
              value={targetName}
              onChange={(event) => {
                const nextName = event.target.value;
                setTargetName(nextName);
                setFindPointVisible(false);
              }}
            />
          </label>

          <label>
            Latitude
            <input
              inputMode="decimal"
              placeholder="contoh 5.980412"
              value={targetLatText}
              onChange={(event) => {
                const nextLatText = event.target.value;
                setTargetLatText(nextLatText);
                setFindPointVisible(false);
              }}
            />
          </label>

          <label>
            Longitude
            <input
              inputMode="decimal"
              placeholder="contoh 116.073456"
              value={targetLngText}
              onChange={(event) => {
                const nextLngText = event.target.value;
                setTargetLngText(nextLngText);
                setFindPointVisible(false);
              }}
            />
          </label>

          {targetValidationMessage && <p className={styles.warning}>{targetValidationMessage}</p>}
          {sabahWarning && <p className={styles.warning}>{sabahWarning}</p>}

          {activeTarget && (
            <div className={styles.activeTargetSummary}>
              <span>Active target</span>
              <strong>Target: {activeTarget.name}</strong>
              <span>Latitude: {activeTarget.lat.toFixed(7)}</span>
              <span>Longitude: {activeTarget.lng.toFixed(7)}</span>
            </div>
          )}

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} onClick={setActiveTargetFromDraft}>
              Set Active Target
            </button>
            <button type="button" onClick={saveDraftTarget}>
              Save Target
            </button>
          </div>

          {findPointVisible && activeTarget && metrics && (
            <div className={styles.findPointResult}>
              <span>Find Point result</span>
              <strong>{formatMeters(metrics.distance)} to {activeTarget.name}</strong>
              <span>Bearing: {formatDegrees(metrics.bearing)} {targetDirection}</span>
              <span>N / E: {formatMeters(metrics.north)} / {formatMeters(metrics.east)}</span>
              <span>GPS accuracy: {formatAccuracy(gps?.accuracy)}</span>
              {gps?.accuracy && metrics.distance <= gps.accuracy && (
                <em>Target is within GPS accuracy range. Use as direction guide only.</em>
              )}
            </div>
          )}

          <div className={styles.buttonRow}>
            <button type="button" onClick={findPoint}>
              Find Point
            </button>
            <button type="button" className={styles.primaryButton} onClick={startArStakeout}>
              AR Guide
            </button>
          </div>

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

          {fieldMessage && <p className={styles.fieldMessage}>{fieldMessage}</p>}
        </div>

        <div className={`${styles.panel} ${styles.statusPanel}`}>
          <h2>GPS Status / Track My Position</h2>

          <div className={`${styles.signalBadge} ${styles[signal.level] ?? ""}`}>
            <span>{signal.label}</span>
            <strong>{signal.detail}</strong>
          </div>

          <div className={styles.buttonRow}>
            <button type="button" className={styles.primaryButton} onClick={startGps}>
              Start GPS
            </button>
            <button type="button" onClick={startGps}>
              Track My Position
            </button>
          </div>

          <div className={styles.buttonRow}>
            <button type="button" onClick={stopGps}>
              Stop GPS
            </button>
            <button type="button" className={styles.secondaryButton} onClick={testCamera}>
              Test Camera
            </button>
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
              <dd>{formatAccuracy(gps?.accuracy)}</dd>
            </div>
            <div>
              <dt>Bearing</dt>
              <dd>{metrics ? `${formatDegrees(metrics.bearing)} ${targetDirection}` : "-"}</dd>
            </div>
            <div>
              <dt>Heading</dt>
              <dd>{heading !== null ? `${formatDegrees(heading)} ${headingDirection}` : headingStatus}</dd>
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

      <section className={`${styles.panel} ${styles.savedTargetLibrary}`}>
        <div className={styles.libraryHeader}>
          <div>
            <p className={styles.kicker}>Stake Out Library</p>
            <h2>Saved Stake Out Targets</h2>
          </div>
          <button type="button" disabled={!activeTarget} onClick={saveActiveTarget}>
            Save Active Target
          </button>
        </div>

        {savedTargets.length === 0 ? (
          <p>Belum ada target disimpan.</p>
        ) : (
          <div className={styles.savedTargetList}>
            {savedTargets.map((savedTarget) => (
              <article key={savedTarget.id}>
                <div>
                  <strong>{savedTarget.name}</strong>
                  <span>
                    {savedTarget.lat.toFixed(7)}, {savedTarget.lng.toFixed(7)}
                  </span>
                  <span>Updated: {savedTarget.updatedAt}</span>
                  {savedTarget.lastUsedAt && <span>Last used: {savedTarget.lastUsedAt}</span>}
                </div>
                <div className={styles.savedTargetActions}>
                  <button type="button" onClick={() => applySavedTarget(savedTarget)}>
                    Use
                  </button>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => stakeOutSavedTarget(savedTarget)}
                  >
                    Stake Out
                  </button>
                  <button type="button" onClick={() => deleteSavedTarget(savedTarget.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className={`${styles.stage} ${arActive ? styles.stageFullscreen : ""}`}>
        <video ref={videoRef} className={styles.arVideo} autoPlay muted playsInline />

        <div className={styles.arOverlay}>
          <div className={styles.arTop}>
            <div>
              <p className={styles.kicker}>AR Guide</p>
              <h2>{activeTarget?.name || "Target Point"}</h2>
              {activeTarget && (
                <span className={styles.arTargetMeta}>
                  {activeTarget.lat.toFixed(7)}, {activeTarget.lng.toFixed(7)}
                </span>
              )}
              <p>{directionText}</p>
            </div>
            <div className={styles.arTopActions}>
              <button type="button" onClick={editTarget}>
                Edit Target
              </button>
              <button type="button" onClick={stopArStakeout}>
                Stop AR
              </button>
            </div>
          </div>

          <div
            className={`${styles.targetDot} ${targetOutsideFov ? styles.targetDotEdge : ""}`}
            style={markerStyle}
          />
          <div className={styles.distanceBubble} style={bubbleStyle}>
            {metrics ? formatMeters(metrics.distance) : "-"}
          </div>

          <div className={styles.guideLine} style={markerStyle}>
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
                aria-label="Target direction"
                style={{
                  transform: `rotate(${arrowRotation}deg)`,
                }}
              />
            </div>
          </div>

          <div className={styles.bottomStrip}>
            <div>
              <span>Target</span>
              <strong>{activeTarget?.name || "-"}</strong>
            </div>
            <div>
              <span>Distance</span>
              <strong>{metrics ? formatMeters(metrics.distance) : "-"}</strong>
            </div>
            <div>
              <span>Bearing</span>
              <strong>{metrics ? `${formatDegrees(metrics.bearing)} ${targetDirection}` : "-"}</strong>
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
            <span>Accuracy: {formatAccuracy(gps?.accuracy)}</span>
            <span>Camera: {cameraStatus}</span>
            <span>Heading: {heading !== null ? `${formatDegrees(heading)} ${headingDirection}` : headingStatus}</span>
            <span>
              Relative: {relativeBearing !== null ? `${formatDegrees(relativeBearing)} ${targetOutsideFov ? "edge" : "view"}` : "-"}
            </span>
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
              Tekan Test Camera untuk uji kamera atau AR Guide untuk mod penuh.
            </div>
          )}
        </div>
      </section>

      <section className={styles.disclaimer}>
        Preliminary field navigation only. Not for cadastral boundary determination.
        <br />
        Navigasi awal sahaja. Bukan penentuan sempadan kadaster rasmi.
      </section>

      <section className={`${styles.panel} ${styles.foundPointRecords}`}>
        <h2>Saved Found Points</h2>
        {savedPoints.length === 0 ? (
          <p>Belum ada rekod.</p>
        ) : (
          <div className={styles.savedList}>
            {savedPoints.map((point) => (
              <article key={point.id}>
                <strong>{point.targetName}</strong>
                <span>
                  Found: {point.foundLat.toFixed(7)}, {point.foundLng.toFixed(7)}
                </span>
                <span>Distance: {formatMeters(point.distance)}</span>
                <span>Bearing: {formatDegrees(point.bearing)}</span>
                <span>Accuracy: {formatAccuracy(point.accuracy)}</span>
                <span>{point.timestamp}</span>
                {point.note && <span>Note: {point.note}</span>}
                <button
                  type="button"
                  onClick={() =>
                    applyTarget(
                      targetFromDraft({
                        name: point.targetName,
                        lat: point.targetLat,
                        lng: point.targetLng,
                      })
                    )
                  }
                >
                  Use Target
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}




