export type DrawingGeometryType =
  | "polygon"
  | "line";

export type DrawingLineStyle =
  | "solid"
  | "dashed"
  | "dotted";

export type DrawingObjectCategory =
  | "parent_lot"
  | "proposed_lot"
  | "standard_line"
  | "proposed_boundary"
  | "proposed_access"
  | "road_reserve"
  | "setback"
  | "reference_line";

export interface DrawingCoordinate {
  lat: number;
  lng: number;
}

export interface DrawingObjectBase {
  id: string;
  geometryType: DrawingGeometryType;
  name: string;
  category: DrawingObjectCategory;
  coordinates: DrawingCoordinate[];
  lineStyle: DrawingLineStyle;
  color: string;
  weight: number;
  isVisible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PolygonDrawingObject
  extends DrawingObjectBase {
  geometryType: "polygon";
  areaSqm: number;
  areaHa: number;
  areaAcre: number;
  perimeterM: number;
}

export interface LineDrawingObject
  extends DrawingObjectBase {
  geometryType: "line";
  lengthM: number;
  startBearing: number | null;
  endBearing: number | null;
}

export type DrawingObject =
  | PolygonDrawingObject
  | LineDrawingObject;
