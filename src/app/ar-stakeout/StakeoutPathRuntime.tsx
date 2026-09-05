"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { readGpsTargetMemory } from "@/utils/gpsTargetMemory";
import StakeoutPathOverlay from "./StakeoutPathOverlay";

type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

type OrientationState = {
  heading: number | null;
  pitch: number | null;
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

function blendAngle(previous: number, next: number, factor: number) {
  return normalize360(previous + normalizeSigned(next - previous) * factor);
}

export default function StakeoutPathRuntime() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [orientation, setOrientation] = useState<OrientationState>({ heading: null, pitch: null });
  const [target, setTarget] = useState<ReturnType<typeof readGpsTargetMemory>>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [movingAway, setMovingAway] = useState(false);

  const stableFixRef = useRef<Fix | null>(null);
  const headingRef = useRef<number | null>(null);
  const pitchRef = useRef<number | null>(null);
  const movementEvidenceRef = useRef(0);

  useEffect(() => {
    const refreshTarget = () => setTarget(readGpsTargetMemory());
    refreshTarget();
    const id = window.setInterval(refreshTarget, 750);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let watchId: number | null = null;
    let previousDistance: number | null = null;
    let awayCount = 0;

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const rawFix: Fix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
          };

          const previousStable = stableFixRef.current;
          let nextFix = rawFix;

          if (previousStable) {
            const movement = distanceMeters(
              previousStable.latitude,
              previousStable.longitude,
              rawFix.latitude,
              rawFix.longitude,
            );
            const accuracy = rawFix.accuracy ?? previousStable.accuracy ?? 4;
            const unlockDistance = Math.max(2.2, Math.min(5.5, accuracy * 0.75));
            const reportedSpeed = position.coords.speed;
            const speedSuggestsMovement =
              typeof reportedSpeed === "number" && Number.isFinite(reportedSpeed) && reportedSpeed >= 0.7;
            const displacementSuggestsMovement = movement >= unlockDistance;

            if (speedSuggestsMovement || displacementSuggestsMovement) {
              movementEvidenceRef.current += 1;
            } else {
              movementEvidenceRef.current = Math.max(0, movementEvidenceRef.current - 1);
            }

            const releaseLock = movementEvidenceRef.current >= 2;

            if (!releaseLock) {
              nextFix = { ...previousStable, accuracy: rawFix.accuracy };
            } else {
              const factor = movement >= 6 ? 0.72 : 0.48;
              nextFix = {
                latitude: previousStable.latitude + (rawFix.latitude - previousStable.latitude) * factor,
                longitude: previousStable.longitude + (rawFix.longitude - previousStable.longitude) * factor,
                accuracy: rawFix.accuracy,
              };
              movementEvidenceRef.current = 0;
            }
          }

          stableFixRef.current = nextFix;
          setFix(nextFix);

          const currentTarget = readGpsTargetMemory();
          if (currentTarget) {
            const nextDistance = distanceMeters(
              nextFix.latitude,
              nextFix.longitude,
              currentTarget.lat,
              currentTarget.lng,
            );

            if (previousDistance !== null) {
              const threshold = Math.max(0.45, Math.min(1.2, (nextFix.accuracy ?? 3) * 0.15));
              if (nextDistance - previousDistance > threshold) awayCount += 1;
              else if (previousDistance - nextDistance > threshold) awayCount = 0;
              else awayCount = Math.max(0, awayCount - 1);
              setMovingAway(awayCount >= 2);
            }

            previousDistance = nextDistance;
          }
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 500, timeout: 15000 },
      );
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    const onOrientation = (event: DeviceOrientationEvent) => {
      const mobileEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let rawHeading: number | null = null;
      if (typeof mobileEvent.webkitCompassHeading === "number") rawHeading = normalize360(mobileEvent.webkitCompassHeading);
      else if (typeof event.alpha === "number") rawHeading = normalize360(360 - event.alpha);

      let nextHeading = headingRef.current;
      if (rawHeading !== null) {
        nextHeading = headingRef.current === null ? rawHeading : blendAngle(headingRef.current, rawHeading, 0.22);
        headingRef.current = nextHeading;
      }

      let nextPitch = pitchRef.current;
      if (typeof event.beta === "number" && Number.isFinite(event.beta)) {
        const rawPitch = Math.max(-180, Math.min(180, event.beta));
        nextPitch = pitchRef.current === null ? rawPitch : pitchRef.current + (rawPitch - pitchRef.current) * 0.12;
        pitchRef.current = nextPitch;
      }

      setOrientation({ heading: nextHeading, pitch: nextPitch });
    };

    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, []);

  useEffect(() => {
    const locateStage = () => {
      const video = document.querySelector("video");
      const section = video?.closest("section") as HTMLElement | null;
      if (!section) return setStage(null);
      const style = window.getComputedStyle(section);
      const isFullscreen = style.position === "fixed" && style.zIndex !== "auto";
      setStage(isFullscreen ? section : null);
      const oldPlot = section.querySelector('svg[aria-label="GNSS-style target centered stakeout plot"]');
      const oldPlotWrap = oldPlot?.parentElement as HTMLElement | null;
      if (oldPlotWrap) oldPlotWrap.style.visibility = isFullscreen ? "hidden" : "visible";
    };

    locateStage();
    const observer = new MutationObserver(locateStage);
    observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "style"] });
    const id = window.setInterval(locateStage, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(id);
    };
  }, []);

  const metrics = useMemo(() => {
    if (!fix || !target) return null;
    const distance = distanceMeters(fix.latitude, fix.longitude, target.lat, target.lng);
    const bearing = bearingDeg(fix.latitude, fix.longitude, target.lat, target.lng);
    const bearingRad = toRad(bearing);
    return {
      distance,
      bearing,
      north: distance * Math.cos(bearingRad),
      east: distance * Math.sin(bearingRad),
      relativeAngle: orientation.heading === null ? null : normalizeSigned(bearing - orientation.heading),
    };
  }, [fix, target, orientation.heading]);

  if (!stage || !target || !metrics) return null;

  return createPortal(
    <div aria-label="AR world-bearing stakeout runtime" style={{ position: "absolute", inset: "118px 0 76px", zIndex: 8, display: "grid", placeItems: "center", pointerEvents: "none", overflow: "hidden" }}>
      <StakeoutPathOverlay
        distance={metrics.distance}
        relativeAngle={metrics.relativeAngle}
        pitch={orientation.pitch}
        north={metrics.north}
        east={metrics.east}
        accuracy={fix?.accuracy ?? null}
        movingAway={movingAway}
        targetName={target.label || "Target Point"}
      />
    </div>,
    stage,
  );
}
