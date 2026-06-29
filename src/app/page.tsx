"use client";

import Map from "./components/Map";
import FounderFieldGpsPanel from "./components/FounderFieldGpsPanel";
// LandRecordOrganizerPanel hidden in handheld branch

export default function Home() {
  return (
    <>
      <Map
        language="en"
        onPolygonChange={() => undefined}
      />
      <FounderFieldGpsPanel />
      {false && {false && <LandRecordOrganizerPanel />}}
    </>
  );
}

