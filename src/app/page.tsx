"use client";

import Map from "./components/Map";
import FounderFieldGpsPanel from "./components/FounderFieldGpsPanel";
import LandRecordOrganizerPanel from "./components/LandRecordOrganizerPanel";

export default function Home() {
  return (
    <>
      <Map
        language="en"
        onPolygonChange={() => undefined}
      />
      <FounderFieldGpsPanel />
      <LandRecordOrganizerPanel />
    </>
  );
}
