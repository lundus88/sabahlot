import type { DrawingObject } from "./drawing-types";

export interface ExportPoint {
  id: string;
  pointCode: string;
  pointName: string;
  category: string;
  coordinate: { lat: number; lng: number };
  isVisible: boolean;
}

export const DXF_CRS_NOTICE =
  "DXF CRS WARNING: EPSG:4326 WGS84 X=longitude and Y=latitude are DECIMAL DEGREES, NOT METRES. This is not metric CAD or survey-grade output. $INSUNITS=0 (unitless). Do not interpret DXF lengths or areas as metres.";

const PRELIMINARY_NOTICE =
  "Preliminary Field Assist output only. Measurements are user-created estimates for field reference and should be checked through the proper Sabah land and survey procedures before formal use.";

const xmlEscape = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character] ?? character,
  );

const categoryLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const coordinateText = (
  coordinates: Array<{ lat: number; lng: number }>,
) =>
  coordinates
    .map((coordinate) => `${coordinate.lng},${coordinate.lat},0`)
    .join(" ");

const closeRing = <T extends { lat: number; lng: number }>(coordinates: T[]) => {
  const first = coordinates[0];
  const last = coordinates.at(-1);

  return first && last && (first.lat !== last.lat || first.lng !== last.lng)
    ? [...coordina¶»§q«^