"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

type JumpDetail = {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  label?: string;
  zoom?: number;
};

const EVENTS = [
  "sabahlot:map-jump-to-coordinate",
  "sabahlot:goto-coordinate",
  "sabahlot:gps-track-position",
];

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function MapCoordinateJumpBridge() {
  const map = useMap();
  const markerRef = useRef<L.CircleMarker | null>(null);

  useEffect(() => {
    const handleJump = (event: Event) => {
      const customEvent = event as CustomEvent<JumpDetail>;
      const detail = customEvent.detail ?? {};

      const lat = readNumber(detail.lat) ?? readNumber(detail.latitude);
      const lng = readNumber(detail.lng) ?? readNumber(detail.longitude);

      if (lat === null || lng === null) return;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

      const zoom = detail.zoom ?? 18;
      const label = detail.label || "Selected coordinate";

      map.flyTo([lat, lng], zoom, {
        animate: true,
        duration: 1,
      });

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }

      markerRef.current = L.circleMarker([lat, lng], {
        radius: 9,
        weight: 3,
        color: "#0f766e",
        fillColor: "#14b8a6",
        fillOpacity: 0.45,
      })
        .addTo(map)
        .bindPopup(label)
        .openPopup();
    };

    EVENTS.forEach((eventName) => {
      window.addEventListener(eventName, handleJump);
    });

    return () => {
      EVENTS.forEach((eventName) => {
        window.removeEventListener(eventName, handleJump);
      });

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [map]);

  return null;
}

export default MapCoordinateJumpBridge;
