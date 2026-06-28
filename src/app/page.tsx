"use client";

import Map from "./components/Map";
import LandRecordOrganizerPanel from "./components/LandRecordOrganizerPanel";

export default function Home() {
  return (
    <>
      <Map
        language="en"
        onPolygonChange={() => undefined}
      />
      <LandRecordOrganizerPanel />
    </>
  );
}
