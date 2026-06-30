"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";

type GoToCoordinateDetail = {
  lat?: number;
  lng?: number;
  latitude?: number;
  longitude?: number;
  label?: string;
  zoom?: number;
};

function CoordinateJumpController() {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const handleGoToCoordinate = (event: Event) => {
      const customEvent = event as CustomEvent<GoToCoordinateDetail>;
      const detail = customEvent.detail ?? {};

      const lat =
        typeof detail.lat === "number" ? detail.lat : detail.latitude;

      const lng =
        typeof detail.lng === "number" ? detail.lng : detail.longitude;

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      ) {
        return;
      }

      const zoom = detail.zoom ?? 18;
      const label = detail.label || "Selected coordinate";

      map.flyTo([lat, lng], zoom, {
        animate: true,
        duration: 1,
      });

      if (markerRef.current) {
        markerRef.current.remove();
      }

      markerRef.current = L.marker([lat, lng])
        .addTo(map)
        .bindPopup(label)
        .openPopup();
    };

    window.addEventListener("sabahlot:goto-coordinate", handleGoToCoordinate);

    return () => {
      window.removeEventListener("sabahlot:goto-coordinate", handleGoToCoordinate);

      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    };
  }, [map]);

  return null;
}

export default CoordinateJumpController;
