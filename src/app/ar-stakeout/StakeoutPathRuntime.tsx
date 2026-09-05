"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { readGpsTargetMemory } from "@/utils/gpsTargetMemory";
import StakeoutPathOverlay from "./StakeoutPathOverlay";

type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
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

export default function StakeoutPathRuntime() {
  const [fix, setFix] = useState<Fix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [target, setTarget] = useState<ReturnType<typeof readGpsTargetMemory>>(null);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const [movingAway, setMovingAway] = useState(false);

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
          const nextFix: Fix = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy ?? null,
          };

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
              const threshold = Math.max(
                0.45,
                Math.min(1.2, (nextFix.accuracy ?? 3) * 0.15),
              );
              if (nextDistance - previousDistance > threshold) {
                awayCount += 1;
              } else if (previousDistance - nextDistance > threshold) {
                awayCount = 0;
              } else {
                awayCount = Math.max(0, awayCount - 1);
              }
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
      const mobileEvent = event as DeviceOrientationEvent & {
        webkitCompassHeading?: number;
      };

      if (typeof mobileEvent.webkitCompassHeading === "number") {
        setHeading(normalize360(mobileEvent.webkitCompassHeading));
      } else if (typeof event.alpha === "number") {
        setHeading(normalize360(360 - event.alpha));
      }
    };

    window.addEventListener("deviceorientation", onOrientation, true);
    return () => window.removeEventListener("deviceorientation", onOrientation, true);
  }, []);

  useEffect(() => {
    const locateStage = () => {
      const video = document.querySelector("video");
      const section = video?.closest("section") as HTMLElement | null;
      if (!section) {
        setStage(null);
        return;
      }

      const style = window.getComputedStyle(section);
      const isFullscreen = style.position === "fixed" && style.zIndex !== "auto";
      setStage(isFullscreen ? section : null);

      const oldPlot = section.querySelector(
        'svg[aria-label="GNSS-style target centered stakeout plot"]',
      );
      const oldPlotWrap = oldPlot?.parentElement as HTMLElement | null;
      if (oldPlotWrap) {
        oldPlotWrap.style.visibility = isFullscreen ? "hidden" : "visible";
      }
    };

    locateStage();
    const observer = new MutationObserver(locateStage);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    const id = window.setInterval(locateStage, 500);

    return () => {
      observer.disconnect();
      window.clearInterval(id);
    };
  }, []);

  const metrics = useMemo(() => {
    if (!fix || !target) return null;
    const distance = distanceMeters(
      fix.latitude,
      fix.longitude,
      target.lat,
      target.lng,
    );
    const bearing = bearingDeg(
      fix.latitude,
      fix.longitude,
      target.lat,
      target.lng,
    );
    const bearingRad = toRad(bearing);

    return {
      distance,
      bearing,
      north: distance * Math.cos(bearingRad),
      east: distance * Math.sin(bearingRad),
      relativeAngle:
        heading === null ? null : normalizeSigned(bearing - heading),
    };
  }, [fix, target, heading]);

  if (!stage || !target || !metrics) return null;

  return createPortal(
    <div
      aria-label="AR dotted-line stakeout runtime"
      style={{
        position: "absolute",
        inset: "250px 0 190px",
        zIndex: 8,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      <StakeoutPathOverlay
        distance={metrics.distance}
        relativeAngle={metrics.relativeAngle}
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
