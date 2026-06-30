"use client";

import Map from "./components/Map";
import FounderFieldGpsPanel from "./components/FounderFieldGpsPanel";
import HandheldCoordinateFinder from "./components/HandheldCoordinateFinder";
export default function Home() {
  return (
    <>
      <Map
        language="en"
        onPolygonChange={() => undefined}
      />
      <FounderFieldGpsPanel />
      <HandheldCoordinateFinder />
      
    </>
  );
}




