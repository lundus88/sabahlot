 "use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import * as turf from "@turf/turf";

export default function Map() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let map: import("leaflet").Map | null = null;

    async function initMap() {
      const L = await import("leaflet");

      delete (L.Icon.Default.prototype as any)._getIconUrl;

      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      map = L.map(mapRef.current!).setView([5.9804, 116.0735], 8);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      const points: [number, number][] = [];
      const markers: import("leaflet").Marker[] = [];
      let polygon: import("leaflet").Polygon | null = null;

      function updatePolygon() {
        if (!map) return;

        if (polygon) {
          map.removeLayer(polygon);
        }

        if (points.length >= 3) {
          polygon = L.polygon(points, {
            color: "blue",
            weight: 3,
            fillColor: "blue",
            fillOpacity: 0.2,
          }).addTo(map);

          const turfCoords = points.map(([lat, lng]) => [lng, lat]);
          turfCoords.push(turfCoords[0]);

          const turfPolygon = turf.polygon([turfCoords]);
          const areaSqm = turf.area(turfPolygon);
          const areaHa = areaSqm / 10000;
          const areaAcre = areaSqm / 4046.8564224;

          polygon.bindPopup(`
            <b>Keluasan Lot</b><br>
            ${areaSqm.toFixed(2)} m²<br>
            ${areaHa.toFixed(4)} hektar<br>
            ${areaAcre.toFixed(4)} ekar
          `).openPopup();
        }
      }

      map.on("click", (e) => {
        const { lat, lng } = e.latlng;
        points.push([lat, lng]);

        const marker = L.marker([lat, lng])
          .addTo(map!)
          .bindPopup(
            `Titik ${points.length}<br>Latitude: ${lat.toFixed(
              6
            )}<br>Longitude: ${lng.toFixed(6)}`
          );

        markers.push(marker);
        updatePolygon();
      });
    }

    initMap();

    return () => {
      if (map) map.remove();
    };
  }, []);

  return <div ref={mapRef} style={{ height: "600px", width: "100%" }} />;
}