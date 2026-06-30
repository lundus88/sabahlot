"use client";

import { useEffect } from "react";
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

  useEffect(() => {
    const handleGoToCoordinate = (event: Event) => {
      const customEvent = event as CustomEvent<GoToCoordinateDetail>;
      const detail = customEvent.detail ?? {};

      const lat = typeof detail.lat === "number" ? detail.lat : detail.latitude;
      const lng = typeof detail.lng === "number" ? detail.lng : detail.longitude;

      if (
        typeof lat !== "number" ||
        typeof lng !== "number" ||
        Number.isNaN(lat) ||
        Number.isNaN(lng)
      ) {
        return;
      }

      map.flyTo([lat, lng], detail.zoom ?? 18, {
        animate: true,
        duration: 1,
      });
    };

    window.addEventListener("sabahlot:goto-coordinate", handleGoToCoordinate);

    return () => {
      window.removeEventListener("sabahlot:goto-coordinate", handleGoToCoordinate);
    };
  }, [map]);

  return null;
}

export default CoordinateJumpController;
