"use client";

import { useState } from "react";

import FieldGpsLite from "@/components/FieldGpsLite";
import FieldGpsQuickActions from "@/components/FieldGpsQuickActions";
import GpsStandaloneBasemap from "@/components/GpsStandaloneBasemap";
import type { FieldGpsPoint } from "@/lib/field-gps.types";
import "leaflet/dist/leaflet.css";

export default function GpsStandalonePage() {
  const [points, setPoints] = useState<FieldGpsPoint[]>([]);

  return (
    <main className="sl-gps-standalone-shell">
      <GpsStandaloneBasemap points={points} />
      <FieldGpsQuickActions />
      <div className="sl-field-gps-stack">
        <FieldGpsLite
          enabled={true}
          recordName=""
          offlineMapNote=""
          onPointsChange={setPoints}
          startOpen={true}
        />
      </div>
    </main>
  );
}
