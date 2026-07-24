"use client";

import {
  useEffect,
  useRef,
} from "react";

import type { FieldGpsPoint } from "@/lib/field-gps.types";

const DEFAULT_CENTER: [number, number] = [
  5.9804,
  116.0735,
]; // Kota Kinabalu, Sabah — fallback until GPS fix arrives

const DEFAULT_ZOOM = 15;

interface GpsStandaloneBasemapProps {
  points: FieldGpsPoint[];
}

export default function GpsStandaloneBasemap({
  points,
}: GpsStandaloneBasemapProps) {
  const containerRef =
    useRef<HTMLDivElement>(null);
  const mapRef =
    useRef<import("leaflet").Map | null>(
      null,
    );
  const pointsLayerRef =
    useRef<import("leaflet").LayerGroup | null>(
      null,
    );
  const leafletModuleRef =
    useRef<typeof import("leaflet") | null>(
      null,
    );

  useEffect(() => {
    let marker: import("leaflet").Marker | null =
      null;
    let watchId: number | null = null;
    let cancelled = false;

    (async () => {
      const L = await import("leaflet");

      if (
        cancelled ||
        !containerRef.current
      ) {
        return;
      }

      leafletModuleRef.current = L;

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
      }).setView(
        DEFAULT_CENTER,
        DEFAULT_ZOOM,
      );

      mapRef.current = map;
      pointsLayerRef.current =
        L.layerGroup().addTo(map);

      // Same default basemap SabahLot uses elsewhere (Esri World
      // Imagery, no API key required) — kept independent from
      // Map.tsx so this standalone page has no lot/land-records
      // dependency.
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 20,
          maxNativeZoom: 18,
          attribution:
            "Imagery &copy; Esri, Maxar, Earthstar Geographics",
        },
      ).addTo(map);

      if (navigator.geolocation) {
        watchId =
          navigator.geolocation.watchPosition(
            (position) => {
              if (
                cancelled ||
                !mapRef.current
              ) {
                return;
              }

              const lat =
                position.coords.latitude;
              const lng =
                position.coords.longitude;

              if (!marker) {
                marker = L.marker([
                  lat,
                  lng,
                ]).addTo(mapRef.current);
                mapRef.current.setView(
                  [lat, lng],
                  DEFAULT_ZOOM,
                );
              } else {
                marker.setLatLng([
                  lat,
                  lng,
                ]);
              }
            },
            () => {
              // Silently keep the fallback center if permission is
              // denied or unavailable — the FieldGpsLite panel above
              // already surfaces its own GPS error messaging.
            },
            {
              enableHighAccuracy: true,
              maximumAge: 5000,
            },
          );
      }
    })();

    return () => {
      cancelled = true;

      if (
        watchId !== null &&
        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          watchId,
        );
      }

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      pointsLayerRef.current = null;
      leafletModuleRef.current = null;
    };
  }, []);

  useEffect(() => {
    const L = leafletModuleRef.current;
    const layer = pointsLayerRef.current;

    if (!L || !layer) {
      return;
    }

    layer.clearLayers();

    points.forEach((point) => {
      L.circleMarker(
        [
          point.latitude,
          point.longitude,
        ],
        {
          radius: 6,
          color: "#F59E0B",
          fillColor: "#F59E0B",
          fillOpacity: 0.9,
          weight: 2,
        },
      )
        .bindTooltip(point.label, {
          permanent: false,
        })
        .addTo(layer);
    });
  }, [points]);

  return (
    <div
      ref={containerRef}
      className="sl-gps-standalone-basemap"
      aria-label="Basemap showing current location and marked points"
    />
  );
}
