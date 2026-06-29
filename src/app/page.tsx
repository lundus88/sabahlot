"use client";

import Map from "./components/Map";
import FounderFieldGpsPanel from "./components/FounderFieldGpsPanel";
export default function Home() {
  return (
    <>
      <Map
        language="en"
        onPolygonChange={() => undefined}
      />
      <FounderFieldGpsPanel />
      
    </>
  );
}



