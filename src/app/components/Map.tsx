 "use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export default function Map() {
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    let map: import("leaflet").Map | null = null;

    async function loadMap() {
      const L = await import("leaflet");

      map = L.map(mapRef.current!).setView([5.9804, 116.0735], 8);

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
    }

    loadMap();

    return () => {
      if (map) map.remove();
    };
  }, []);

  return <div ref={mapRef} style={{ height: "500px", width: "100%" }} />;
}