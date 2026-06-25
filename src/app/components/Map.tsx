 "use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import "leaflet/dist/leaflet.css";

import type {
  DrawingLineStyle,
  DrawingObject,
  DrawingObjectCategory,
  LineDrawingObject,
  PolygonDrawingObject,
} from "@/lib/drawing-types";

import type {
  OfflineMapView,
} from "@/lib/offline-map-cache";

import type {
  Layer,
  LayerGroup,
  Map as LeafletMap,
  TileLayer,
  TileLayerOptions,
} from "leaflet";

export type AppLanguage = "en" | "ms";
export type DistanceUnit = "m" | "ft" | "link" | "chain";
export type AreaUnit = "m2" | "ft2" | "ha" | "acre";

export type BaseMapId =
  | "osmStandard"
  | "osmHumanitarian"
  | "openTopoMap"
  | "cartoVoyager"
  | "cartoVoyagerNoLabels"
  | "cartoPositron"
  | "cartoPositronNoLabels"
  | "cartoDarkMatter"
  | "cartoDarkMatterNoLabels"
  | "esriWorldImagery"
  | "hybridOpenSource"
  | "esriWorldStreet"
  | "esriWorldTopo"
  | "esriWorldGray"
  | "esriWorldOcean";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface PolygonSegment {
  segmentNumber: number;
  startPointNumber: number;
  endPointNumber: number;
  startCoordinate: Coordinate;
  endCoordinate: Coordinate;
  bearingDecimal: number;
  bearingDms: string;
  distanceM: number;
  distanceKm: number;
  distanceFt: number;
  distanceLink: number;
  distanceChain: number;
}

export interface PolygonResult {
  coordinates: Coordinate[];
  segments: PolygonSegment[];
  areaM2: number;
  areaSqFt: number;
  areaHa: number;
  areaAcre: number;
  perimeterM: number;
  perimeterKm: number;
  perimeterFt: number;
  perimeterLink: number;
  perimeterChain: number;
  displayDistanceUnit: DistanceUnit;
  displayAreaUnit: AreaUnit;
  displayLanguage: AppLanguage;
  displayBaseMap: BaseMapId;
}

export interface ManualPointExport {
  id: string;
  pointCode: string;
  pointName: string;
  category: string;
  coordinate: Coordinate;
  isVisible: boolean;
}

interface MapProps {
  language: AppLanguage;
  lotName?: string;
  initialCoordinates?: Coordinate[];
  initialDrawingObjects?: DrawingObject[];
  initialActiveObjectId?: string | null;
  onPolygonChange: (result: PolygonResult | null) => void;
  onDrawingObjectsChange?: (
    objects: DrawingObject[],
    options?: {
      markUnsaved?: boolean;
    },
  ) => void;
  onManualPointsChange?: (
    points: ManualPointExport[],
  ) => void;
  onActiveObjectChange?: (objectId: string | null) => void;
  onSaveLot?: () => void;
  onExportPdf?: () => void;
  onExportKml?: () => void;
  onExportDxf?: () => void;
  isSavingLot?: boolean;
  isExportingPdf?: boolean;
  hasUnsavedChanges?: boolean;
  onOpenLotPanel?: () => void;
  onLanguageChange?: (language: AppLanguage) => void;
  onAreaUnitChange?: (areaUnit: AreaUnit) => void;
  onMapViewChange?: (view: OfflineMapView) => void;
}

type CoordinatePair = [number, number];
type LabelMode = "full" | "compact" | "minimal";
type ActiveFieldTool =
  | "polygon"
  | "line"
  | "dashed_line"
  | "add_point"
  | null;
type DashedLineCategory =
  | "proposed_boundary"
  | "proposed_access"
  | "road_reserve"
  | "setback"
  | "reference_line";
type FieldPointCategory =
  | "boundary_mark"
  | "control_point"
  | "reference_point"
  | "site_feature"
  | "other";

interface BaseMapDefinition {
  id: BaseMapId;
  nameEn: string;
  nameMs: string;
  url: string;
  options: TileLayerOptions;
  overlayUrl?: string;
  overlayOptions?: TileLayerOptions;
}

interface LabelBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

interface PdfOverlayPoint {
  x: number;
  y: number;
  lat: number;
  lng: number;
}

interface PdfOverlaySegment {
  start: PdfOverlayPoint;
  end: PdfOverlayPoint;
  midpoint: {
    x: number;
    y: number;
  };
  angle: number;
  distanceText: string;
  unitText: string;
  bearing: string;
}

interface PdfOverlayGeometry {
  width: number;
  height: number;
  vertices: PdfOverlayPoint[];
  segments: PdfOverlaySegment[];
}

interface DashedLineFeature {
  id: string;
  category: DashedLineCategory;
  coordinates: CoordinatePair[];
  createdAt: string;
}

interface ManualFieldPoint {
  id: string;
  pointCode: string;
  pointName: string;
  category: FieldPointCategory;
  notes: string;
  coordinate: CoordinatePair;
  isVisible: boolean;
  createdAt: string;
}

const EARTH_RADIUS_METERS = 6378137;
const SQM_TO_SQFT = 10.7639104167;
const SQM_PER_ACRE = 4046.8564224;

const METERS_PER_FOOT = 0.3048;
const METERS_PER_LINK = 0.201168;
const METERS_PER_CHAIN = 20.1168;

const MIN_SEGMENT_METERS = 0.5;
const MIN_CLICK_PIXELS = 8;

const DEFAULT_CENTRE: CoordinatePair = [
  5.45,
  117.05,
];

const DEFAULT_ZOOM = 8;

const DEFAULT_BASEMAP: BaseMapId =
  "hybridOpenSource";
const WEB_DRAWING_LINE_COLOR =
  "#DC2626";
const WEB_DRAWING_SELECTED_COLOR =
  "#B91C1C";

const DASHED_LINE_CATEGORIES: Array<{
  value: DashedLineCategory;
  label: string;
}> = [
  {
    value: "proposed_boundary",
    label: "Proposed Boundary",
  },
  {
    value: "proposed_access",
    label: "Proposed Access",
  },
  {
    value: "road_reserve",
    label: "Road Reserve",
  },
  {
    value: "setback",
    label: "Setback",
  },
  {
    value: "reference_line",
    label: "Reference Line",
  },
];

const DASHED_LINE_STYLE = {
  color: WEB_DRAWING_LINE_COLOR,
  weight: 2,
  dashArray: "10 8",
};

const FIELD_POINT_CATEGORIES: Array<{
  value: FieldPointCategory;
  label: string;
}> = [
  {
    value: "boundary_mark",
    label: "Boundary Mark",
  },
  {
    value: "control_point",
    label: "Control Point",
  },
  {
    value: "reference_point",
    label: "Reference Point",
  },
  {
    value: "site_feature",
    label: "Site Feature",
  },
  {
    value: "other",
    label: "Other",
  },
];

const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

const CARTO_ATTRIBUTION =
  `${OSM_ATTRIBUTION} &copy; ` +
  '<a href="https://carto.com/attributions">CARTO</a>';

const BASE_MAPS: BaseMapDefinition[] = [
  {
    id: "osmStandard",
    nameEn: "OpenStreetMap Standard",
    nameMs: "OpenStreetMap Standard",
    url:
      "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution: OSM_ATTRIBUTION,
    },
  },
  {
    id: "osmHumanitarian",
    nameEn: "OSM Humanitarian",
    nameMs: "OSM Kemanusiaan",
    url:
      "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    options: {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution:
        `${OSM_ATTRIBUTION}, ` +
        "Humanitarian OpenStreetMap Team",
    },
  },
  {
    id: "openTopoMap",
    nameEn: "OpenTopoMap",
    nameMs: "OpenTopoMap",
    url:
      "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    options: {
      maxZoom: 20,
      maxNativeZoom: 17,
      attribution:
        `Map data ${OSM_ATTRIBUTION}, ` +
        "SRTM | Map style &copy; OpenTopoMap",
    },
  },
  {
    id: "cartoVoyager",
    nameEn: "CARTO Voyager",
    nameMs: "CARTO Voyager",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "rastertiles/voyager/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "cartoVoyagerNoLabels",
    nameEn:
      "CARTO Voyager — No Labels",
    nameMs:
      "CARTO Voyager — Tanpa Label",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "rastertiles/voyager_nolabels/" +
      "{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "cartoPositron",
    nameEn: "CARTO Positron",
    nameMs: "CARTO Positron",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "light_all/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "cartoPositronNoLabels",
    nameEn:
      "CARTO Positron — No Labels",
    nameMs:
      "CARTO Positron — Tanpa Label",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "light_nolabels/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "cartoDarkMatter",
    nameEn: "CARTO Dark Matter",
    nameMs: "CARTO Tema Gelap",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "dark_all/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "cartoDarkMatterNoLabels",
    nameEn:
      "CARTO Dark Matter — No Labels",
    nameMs:
      "CARTO Tema Gelap — Tanpa Label",
    url:
      "https://{s}.basemaps.cartocdn.com/" +
      "dark_nolabels/{z}/{x}/{y}{r}.png",
    options: {
      maxZoom: 20,
      subdomains: "abcd",
      attribution: CARTO_ATTRIBUTION,
    },
  },
  {
    id: "esriWorldImagery",
    nameEn:
      "Esri World Imagery (Satellite)",
    nameMs:
      "Esri Imej Dunia (Satelit)",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/World_Imagery/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution:
        "Tiles &copy; Esri, Maxar, " +
        "Earthstar Geographics",
    },
  },
  {
    id: "hybridOpenSource",
    nameEn:
      "Satellite Hybrid (OpenStreetMap Labels)",
    nameMs:
      "Satelit Hibrid (Label OpenStreetMap)",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/World_Imagery/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 18,
      attribution:
        "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    },
    overlayUrl:
      "https://{s}.basemaps.cartocdn.com/" +
      "rastertiles/voyager_only_labels/" +
      "{z}/{x}/{y}{r}.png",
    overlayOptions: {
      maxZoom: 20,
      subdomains:
        "abcd",
      attribution:
        CARTO_ATTRIBUTION,
    },
  },
  {
    id: "esriWorldStreet",
    nameEn:
      "Esri World Street Map",
    nameMs:
      "Esri Peta Jalan Dunia",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/World_Street_Map/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution:
        "Tiles &copy; Esri",
    },
  },
  {
    id: "esriWorldTopo",
    nameEn:
      "Esri World Topographic",
    nameMs:
      "Esri Topografi Dunia",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/World_Topo_Map/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 19,
      attribution:
        "Tiles &copy; Esri",
    },
  },
  {
    id: "esriWorldGray",
    nameEn:
      "Esri Light Gray Canvas",
    nameMs:
      "Esri Kanvas Kelabu Cerah",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/Canvas/" +
      "World_Light_Gray_Base/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 16,
      attribution:
        "Tiles &copy; Esri",
    },
  },
  {
    id: "esriWorldOcean",
    nameEn:
      "Esri World Ocean",
    nameMs:
      "Esri Lautan Dunia",
    url:
      "https://server.arcgisonline.com/" +
      "ArcGIS/rest/services/Ocean/" +
      "World_Ocean_Base/" +
      "MapServer/tile/{z}/{y}/{x}",
    options: {
      maxZoom: 20,
      maxNativeZoom: 16,
      attribution:
        "Tiles &copy; Esri",
    },
  },
];

const MAP_TEXT = {
  en: {
    mapReady:
      "Map ready. Press Start Drawing to begin.",

    drawingActive:
      "Drawing active. Click or tap each lot corner.",

    pointsRecorded: (
      count: number,
    ) =>
      `${count} points recorded. ` +
      "Continue or complete the polygon.",

    pointTooClose:
      "The new point is too close to the previous point.",

    allPointsRemoved:
      "All points have been removed.",

    lastPointRemoved: (
      count: number,
    ) =>
      `Last point removed. ` +
      `${count} points remaining.`,

    polygonMinimum:
      "At least three different points are required.",

    polygonCompleted:
      "Polygon completed.",

    polygonDeleted:
      "Polygon deleted. Start a new drawing when ready.",

    startDrawing:
      "Start Drawing",

    undoPoint:
      "Undo Point",

    completePolygon:
      "Complete Polygon",

    saveLot:
      "Save Lot",

    saveRequiresPolygon:
      "Complete the polygon first.",

    exportPdf:
      "Export PDF Plan",

    editPolygon:
      "Edit Polygon",

    finishEditing:
      "Finish Editing",

    delete:
      "Delete Polygon",

    trackLocation:
      "Track My Location",

    stopTracking:
      "Stop Tracking",

    points:
      "Points",

    settings:
      "Map Settings",

    mapDisplay:
      "Map and plan display",

    settingsDescription:
      "Choose the basemap and display units.",

    baseMap:
      "Basemap",

    distanceUnit:
      "Distance unit",

    areaUnit:
      "Lot area unit",

    meter:
      "Metres",

    feet:
      "Feet",

    link:
      "Link",

    chain:
      "Chain",

    squareMetres:
      "Square metres",

    squareFeet:
      "Square feet",

    hectares:
      "Hectares",

    acres:
      "Acres",

    searchPlaceholder:
      "Find address or place",

    search:
      "Search",

    searchEmpty:
      "Enter a location or coordinates.",

    searchNotFound:
      "Location not found.",

    searchFailed:
      "Search could not be completed.",

    searching:
      "Searching location...",

    openLot:
      "Lot information",

    fitPolygon:
      "Fit polygon",

    resetSabah:
      "Reset to Sabah",

    zoomIn:
      "Zoom in",

    zoomOut:
      "Zoom out",

    locationNotTracked:
      "Location not tracked",

    locating:
      "Finding current location...",

    trackingStopped:
      "Location tracking stopped",

    locationSuccess: (
      accuracy: number,
    ) =>
      `Location tracked · ` +
      `±${accuracy.toFixed(1)} m`,

    locationUnsupported:
      "Location services are not supported.",

    locationDenied:
      "Location permission was denied.",

    locationUnavailable:
      "Current location is unavailable.",

    locationTimeout:
      "Location request timed out.",

    currentLocation:
      "Current Location",

    latitude:
      "Latitude",

    longitude:
      "Longitude",

    accuracy:
      "Accuracy",

    defaultLot:
      "LOT",

    station:
      "Station",
  },

  ms: {
    mapReady:
      "Peta sedia. Tekan Mula Lukis untuk bermula.",

    drawingActive:
      "Lukisan aktif. Klik atau sentuh setiap penjuru lot.",

    pointsRecorded: (
      count: number,
    ) =>
      `${count} titik direkodkan. ` +
      "Teruskan atau siapkan polygon.",

    pointTooClose:
      "Titik baharu terlalu dekat dengan titik sebelumnya.",

    allPointsRemoved:
      "Semua titik telah dibuang.",

    lastPointRemoved: (
      count: number,
    ) =>
      `Titik terakhir dibuang. ` +
      `Baki ${count} titik.`,

    polygonMinimum:
      "Sekurang-kurangnya tiga titik berbeza diperlukan.",

    polygonCompleted:
      "Polygon siap.",

    polygonDeleted:
      "Polygon dipadam. Mulakan lukisan baharu apabila bersedia.",

    startDrawing:
      "Mula Lukis",

    undoPoint:
      "Undur Titik",

    completePolygon:
      "Siap Polygon",

    saveLot:
      "Save Lot",

    saveRequiresPolygon:
      "Complete the polygon first.",

    exportPdf:
      "Eksport Pelan PDF",

    editPolygon:
      "Sunting Polygon",

    finishEditing:
      "Selesai Sunting",

    delete:
      "Padam Polygon",

    trackLocation:
      "Jejak Lokasi Saya",

    stopTracking:
      "Henti Tracking",

    points:
      "Titik",

    settings:
      "Tetapan Peta",

    mapDisplay:
      "Paparan peta dan pelan",

    settingsDescription:
      "Pilih peta asas dan unit paparan.",

    baseMap:
      "Peta asas",

    distanceUnit:
      "Unit jarak",

    areaUnit:
      "Unit luas lot",

    meter:
      "Meter",

    feet:
      "Kaki",

    link:
      "Link",

    chain:
      "Rantai",

    squareMetres:
      "Meter persegi",

    squareFeet:
      "Kaki persegi",

    hectares:
      "Hektar",

    acres:
      "Ekar",

    searchPlaceholder:
      "Find address or place",

    search:
      "Cari",

    searchEmpty:
      "Masukkan lokasi atau koordinat.",

    searchNotFound:
      "Lokasi tidak ditemui.",

    searchFailed:
      "Carian tidak dapat diselesaikan.",

    searching:
      "Mencari lokasi...",

    openLot:
      "Maklumat lot",

    fitPolygon:
      "Muatkan polygon",

    resetSabah:
      "Kembali ke Sabah",

    zoomIn:
      "Zum masuk",

    zoomOut:
      "Zum keluar",

    locationNotTracked:
      "Lokasi belum dijejaki",

    locating:
      "Mencari lokasi semasa...",

    trackingStopped:
      "Tracking lokasi dihentikan",

    locationSuccess: (
      accuracy: number,
    ) =>
      `Lokasi dijejaki · ` +
      `±${accuracy.toFixed(1)} m`,

    locationUnsupported:
      "Perkhidmatan lokasi tidak disokong.",

    locationDenied:
      "Kebenaran lokasi ditolak.",

    locationUnavailable:
      "Lokasi semasa tidak tersedia.",

    locationTimeout:
      "Permintaan lokasi tamat masa.",

    currentLocation:
      "Lokasi Semasa",

    latitude:
      "Latitud",

    longitude:
      "Longitud",

    accuracy:
      "Ketepatan",

    defaultLot:
      "LOT",

    station:
      "Stesen",
  },
} as const;

function degreesToRadians(
  value: number,
): number {
  return (
    value *
    Math.PI
  ) / 180;
}

function radiansToDegrees(
  value: number,
): number {
  return (
    value *
    180
  ) / Math.PI;
}

function formatNumber(
  value: number,
  decimals = 2,
  language: AppLanguage = "en",
): string {
  return new Intl.NumberFormat(
    language === "en"
      ? "en-MY"
      : "ms-MY",
    {
      minimumFractionDigits:
        decimals,

      maximumFractionDigits:
        decimals,
    },
  ).format(value);
}

function escapeHtml(
  value: string,
): string {
  const replacements:
    Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

  return value.replace(
    /[&<>"']/g,
    (
      character,
    ) =>
      replacements[
        character
      ],
  );
}

function calculateDistance(
  startPoint: CoordinatePair,
  endPoint: CoordinatePair,
): number {
  const latitude1 =
    degreesToRadians(
      startPoint[0],
    );

  const latitude2 =
    degreesToRadians(
      endPoint[0],
    );

  const latitudeDifference =
    degreesToRadians(
      endPoint[0] -
        startPoint[0],
    );

  const longitudeDifference =
    degreesToRadians(
      endPoint[1] -
        startPoint[1],
    );

  const haversine =
    Math.sin(
      latitudeDifference /
        2,
    ) ** 2 +
    Math.cos(
      latitude1,
    ) *
      Math.cos(
        latitude2,
      ) *
      Math.sin(
        longitudeDifference /
          2,
      ) ** 2;

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(
      Math.sqrt(
        haversine,
      ),
      Math.sqrt(
        1 -
          haversine,
      ),
    )
  );
}

function sanitizePoints(
  points: CoordinatePair[],
): CoordinatePair[] {
  const cleaned:
    CoordinatePair[] = [];

  points.forEach(
    (
      point,
    ) => {
      const previous =
        cleaned[
          cleaned.length -
            1
        ];

      if (
        !previous ||
        calculateDistance(
          previous,
          point,
        ) >=
          MIN_SEGMENT_METERS
      ) {
        cleaned.push(
          point,
        );
      }
    },
  );

  if (
    cleaned.length >=
    2
  ) {
    const first =
      cleaned[0];

    const last =
      cleaned[
        cleaned.length -
          1
      ];

    if (
      calculateDistance(
        first,
        last,
      ) <
      MIN_SEGMENT_METERS
    ) {
      cleaned.pop();
    }
  }

  return cleaned;
}

function calculatePolygonArea(
  points: CoordinatePair[],
): number {
  if (
    points.length <
    3
  ) {
    return 0;
  }

  let area = 0;

  for (
    let index = 0;
    index <
    points.length;
    index += 1
  ) {
    const current =
      points[index];

    const next =
      points[
        (
          index + 1
        ) %
          points.length
      ];

    const latitude1 =
      degreesToRadians(
        current[0],
      );

    const latitude2 =
      degreesToRadians(
        next[0],
      );

    const longitudeDifference =
      degreesToRadians(
        next[1] -
          current[1],
      );

    area +=
      longitudeDifference *
      (
        2 +
        Math.sin(
          latitude1,
        ) +
        Math.sin(
          latitude2,
        )
      );
  }

  return Math.abs(
    (
      area *
      EARTH_RADIUS_METERS **
        2
    ) /
      2,
  );
}

function calculatePerimeter(
  points: CoordinatePair[],
): number {
  if (
    points.length <
    3
  ) {
    return 0;
  }

  return points.reduce(
    (
      total,
      point,
      index,
    ) => {
      const next =
        points[
          (
            index + 1
          ) %
            points.length
        ];

      const distance =
        calculateDistance(
          point,
          next,
        );

      return distance >=
        MIN_SEGMENT_METERS
        ? total +
            distance
        : total;
    },
    0,
  );
}

function calculateBearing(
  startPoint: CoordinatePair,
  endPoint: CoordinatePair,
): number {
  const latitude1 =
    degreesToRadians(
      startPoint[0],
    );

  const latitude2 =
    degreesToRadians(
      endPoint[0],
    );

  const longitudeDifference =
    degreesToRadians(
      endPoint[1] -
        startPoint[1],
    );

  const y =
    Math.sin(
      longitudeDifference,
    ) *
    Math.cos(
      latitude2,
    );

  const x =
    Math.cos(
      latitude1,
    ) *
      Math.sin(
        latitude2,
      ) -
    Math.sin(
      latitude1,
    ) *
      Math.cos(
        latitude2,
      ) *
      Math.cos(
        longitudeDifference,
      );

  return (
    radiansToDegrees(
      Math.atan2(
        y,
        x,
      ),
    ) + 360
  ) % 360;
}

function bearingToDms(
  value: number,
): string {
  let bearing =
    (
      (
        value %
        360
      ) + 360
    ) % 360;

  let degrees =
    Math.floor(
      bearing,
    );

  const minuteValue =
    (
      bearing -
      degrees
    ) * 60;

  let minutes =
    Math.floor(
      minuteValue,
    );

  let seconds =
    Math.round(
      (
        minuteValue -
        minutes
      ) * 60,
    );

  if (
    seconds === 60
  ) {
    seconds = 0;
    minutes += 1;
  }

  if (
    minutes === 60
  ) {
    minutes = 0;

    degrees =
      (
        degrees + 1
      ) % 360;
  }

  return (
    `${String(
      degrees,
    ).padStart(
      3,
      "0",
    )}°` +
    " " +
    `${String(
      minutes,
    ).padStart(
      2,
      "0",
    )}′ ` +
    `${String(
      seconds,
    ).padStart(
      2,
      "0",
    )}″`
  );
}

function distanceFromMeters(
  value: number,
  unit: DistanceUnit,
): number {
  switch (
    unit
  ) {
    case "ft":
      return (
        value /
        METERS_PER_FOOT
      );

    case "link":
      return (
        value /
        METERS_PER_LINK
      );

    case "chain":
      return (
        value /
        METERS_PER_CHAIN
      );

    default:
      return value;
  }
}

function distanceSymbol(
  unit: DistanceUnit,
  language: AppLanguage,
): string {
  switch (
    unit
  ) {
    case "ft":
      return "ft";

    case "link":
      return "link";

    case "chain":
      return language ===
        "en"
        ? "ch"
        : "rantai";

    default:
      return "m";
  }
}

function formatAreaNumber(
  value: number,
  language: AppLanguage,
  minimumFractionDigits: number,
): string {
  return new Intl.NumberFormat(
    language === "en"
      ? "en-MY"
      : "ms-MY",
    {
      minimumFractionDigits,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

export function formatAreaDisplay(
  areaM2: number,
  unit: AreaUnit,
  language: AppLanguage,
): {
  text: string;
  symbol: string;
} {
  switch (
    unit
  ) {
    case "ft2":
      return {
        text:
          formatAreaNumber(
            areaM2 *
              SQM_TO_SQFT,
            language,
            0,
          ),

        symbol:
          "ft²",
      };

    case "ha":
      return {
        text:
          formatAreaNumber(
            areaM2 /
              10000,
            language,
            2,
          ),

        symbol:
          "ha",
      };

    case "acre":
      return {
        text:
          formatAreaNumber(
            areaM2 /
              SQM_PER_ACRE,
            language,
            2,
          ),

        symbol:
          "ac",
      };

    default:
      return {
        text:
          formatAreaNumber(
            areaM2,
            language,
            2,
          ),

        symbol:
          "m²",
      };
  }
}

function polygonCentroid(
  points: CoordinatePair[],
): CoordinatePair {
  if (
    points.length ===
    0
  ) {
    return DEFAULT_CENTRE;
  }

  if (
    points.length <
    3
  ) {
    return [
      points.reduce(
        (
          total,
          point,
        ) =>
          total +
          point[0],
        0,
      ) /
        points.length,

      points.reduce(
        (
          total,
          point,
        ) =>
          total +
          point[1],
        0,
      ) /
        points.length,
    ];
  }

  let signedArea =
    0;

  let centroidLongitude =
    0;

  let centroidLatitude =
    0;

  for (
    let index = 0;
    index <
    points.length;
    index += 1
  ) {
    const current =
      points[index];

    const next =
      points[
        (
          index + 1
        ) %
          points.length
      ];

    const cross =
      current[1] *
        next[0] -
      next[1] *
        current[0];

    signedArea +=
      cross;

    centroidLongitude +=
      (
        current[1] +
        next[1]
      ) *
      cross;

    centroidLatitude +=
      (
        current[0] +
        next[0]
      ) *
      cross;
  }

  signedArea *=
    0.5;

  if (
    Math.abs(
      signedArea,
    ) <
    1e-12
  ) {
    return [
      points.reduce(
        (
          total,
          point,
        ) =>
          total +
          point[0],
        0,
      ) /
        points.length,

      points.reduce(
        (
          total,
          point,
        ) =>
          total +
          point[1],
        0,
      ) /
        points.length,
    ];
  }

  return [
    centroidLatitude /
      (
        6 *
        signedArea
      ),

    centroidLongitude /
      (
        6 *
        signedArea
      ),
  ];
}

function createSegments(
  points: CoordinatePair[],
): PolygonSegment[] {
  if (
    points.length <
    3
  ) {
    return [];
  }

  return points.map(
    (
      start,
      index,
    ) => {
      const end =
        points[
          (
            index + 1
          ) %
            points.length
        ];

      const distanceM =
        calculateDistance(
          start,
          end,
        );

      const bearingDecimal =
        calculateBearing(
          start,
          end,
        );

      return {
        segmentNumber:
          index + 1,

        startPointNumber:
          index + 1,

        endPointNumber:
          (
            (
              index + 1
            ) %
              points.length
          ) + 1,

        startCoordinate: {
          lat:
            start[0],

          lng:
            start[1],
        },

        endCoordinate: {
          lat:
            end[0],

          lng:
            end[1],
        },

        bearingDecimal,

        bearingDms:
          bearingToDms(
            bearingDecimal,
          ),

        distanceM,

        distanceKm:
          distanceM /
          1000,

        distanceFt:
          distanceM /
          METERS_PER_FOOT,

        distanceLink:
          distanceM /
          METERS_PER_LINK,

        distanceChain:
          distanceM /
          METERS_PER_CHAIN,
      };
    },
  );
}

function createPolygonResult(
  points: CoordinatePair[],
  distanceUnit: DistanceUnit,
  areaUnit: AreaUnit,
  language: AppLanguage,
  baseMap: BaseMapId,
): PolygonResult {
  const areaM2 =
    calculatePolygonArea(
      points,
    );

  const perimeterM =
    calculatePerimeter(
      points,
    );

  return {
    coordinates:
      points.map(
        (
          [
            lat,
            lng,
          ],
        ) => ({
          lat,
          lng,
        }),
      ),

    segments:
      createSegments(
        points,
      ),

    areaM2,

    areaSqFt:
      areaM2 *
      SQM_TO_SQFT,

    areaHa:
      areaM2 /
      10000,

    areaAcre:
      areaM2 /
      SQM_PER_ACRE,

    perimeterM,

    perimeterKm:
      perimeterM /
      1000,

    perimeterFt:
      perimeterM /
      METERS_PER_FOOT,

    perimeterLink:
      perimeterM /
      METERS_PER_LINK,

    perimeterChain:
      perimeterM /
      METERS_PER_CHAIN,

    displayDistanceUnit:
      distanceUnit,

    displayAreaUnit:
      areaUnit,

    displayLanguage:
      language,

    displayBaseMap:
      baseMap,
  };
}

function getBaseMap(
  id: BaseMapId,
): BaseMapDefinition {
  return (
    BASE_MAPS.find(
      (
        item,
      ) =>
        item.id ===
        id,
    ) ??
    BASE_MAPS[0]
  );
}

function getBaseMapName(
  item: BaseMapDefinition,
  language: AppLanguage,
): string {
  return language ===
    "en"
    ? item.nameEn
    : item.nameMs;
}

function createBaseLayer(
  L: typeof import("leaflet"),
  id: BaseMapId,
): Layer {
  const definition =
    getBaseMap(
      id,
    );

  const baseLayer =
    L.tileLayer(
      definition.url,
      {
        ...definition.options,

        updateWhenIdle:
          true,

        keepBuffer:
          3,
      },
    );

  if (
    !definition.overlayUrl
  ) {
    return baseLayer;
  }

  const overlayLayer =
    L.tileLayer(
      definition.overlayUrl,
      {
        ...definition.overlayOptions,

        updateWhenIdle:
          true,

        keepBuffer:
          3,
      },
    );

  return L.layerGroup([
    baseLayer,
    overlayLayer,
  ]);
}

function getOfflineMapTileSource(
  id: BaseMapId,
): Pick<
  OfflineMapView,
  "tileUrlTemplate" | "subdomains"
> {
  const definition =
    getBaseMap(id);
  const subdomains =
    definition.options.subdomains;

  return {
    tileUrlTemplate:
      definition.url,
    subdomains:
      typeof subdomains === "string"
        ? subdomains.split("")
        : Array.isArray(subdomains)
          ? subdomains.map(String)
          : ["a"],
  };
}

function parseCoordinates(
  value: string,
): CoordinatePair | null {
  const match =
    value
      .trim()
      .match(
        /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/,
      );

  if (
    !match
  ) {
    return null;
  }

  const latitude =
    Number(
      match[1],
    );

  const longitude =
    Number(
      match[2],
    );

  if (
    !Number.isFinite(
      latitude,
    ) ||
    !Number.isFinite(
      longitude,
    ) ||
    latitude <
      -90 ||
    latitude >
      90 ||
    longitude <
      -180 ||
    longitude >
      180
  ) {
    return null;
  }

  return [
    latitude,
    longitude,
  ];
}

function boxesOverlap(
  first: LabelBox,
  second: LabelBox,
  padding = 5,
): boolean {
  return !(
    first.right +
      padding <
      second.left ||

    first.left -
      padding >
      second.right ||

    first.bottom +
      padding <
      second.top ||

    first.top -
      padding >
      second.bottom
  );
}

function canUseBox(
  candidate: LabelBox,
  occupied: LabelBox[],
): boolean {
  return !occupied.some(
    (
      box,
    ) =>
      boxesOverlap(
        candidate,
        box,
      ),
  );
}

function simpleBox(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
): LabelBox {
  return {
    left:
      centreX -
      width / 2,

    top:
      centreY -
      height / 2,

    right:
      centreX +
      width / 2,

    bottom:
      centreY +
      height / 2,
  };
}

function rotatedBox(
  centreX: number,
  centreY: number,
  width: number,
  height: number,
  angleDegrees: number,
): LabelBox {
  const angle =
    degreesToRadians(
      angleDegrees,
    );

  const rotatedWidth =
    Math.abs(
      width *
        Math.cos(
          angle,
        ),
    ) +
    Math.abs(
      height *
        Math.sin(
          angle,
        ),
    );

  const rotatedHeight =
    Math.abs(
      width *
        Math.sin(
          angle,
        ),
    ) +
    Math.abs(
      height *
        Math.cos(
          angle,
        ),
    );

  return simpleBox(
    centreX,
    centreY,
    rotatedWidth,
    rotatedHeight,
  );
}

function labelMode(
  zoom: number,
  width: number,
  height: number,
): LabelMode {
  if (
    zoom >= 17 &&
    width >= 210 &&
    height >= 115
  ) {
    return "full";
  }

  if (
    width >= 125 &&
    height >= 70
  ) {
    return "compact";
  }

  return "minimal";
}

function minimumSegmentPixels(
  zoom: number,
): number {
  if (
    zoom >= 19
  ) {
    return 44;
  }

  if (
    zoom >= 18
  ) {
    return 56;
  }

  if (
    zoom >= 17
  ) {
    return 72;
  }

  if (
    zoom >= 16
  ) {
    return 96;
  }

  if (
    zoom >= 15
  ) {
    return 130;
  }

  return Number.POSITIVE_INFINITY;
}

function readableSegmentAngle(
  angle: number,
): number {
  let normalized =
    angle;

  while (normalized > 90) {
    normalized -= 180;
  }

  while (normalized < -90) {
    normalized += 180;
  }

  return normalized;
}

function segmentLabelOffsets(
  pixelLength: number,
  options?: {
    lineStyle?: DrawingLineStyle;
    showDistance?: boolean;
    lineAnnotation?: boolean;
  },
): number[] {
  if (
    options?.lineAnnotation
  ) {
    return [
      8,
      -8,
      10,
      -10,
      6,
      -6,
    ];
  }

  if (
    options?.showDistance === false
  ) {
    const baseOffset =
      options.lineStyle === "dashed"
        ? pixelLength < 72
          ? 11
          : 9
        : pixelLength < 72
          ? 10
          : 7;

    return [
      baseOffset,
      baseOffset + 2,
      baseOffset + 4,
      baseOffset + 6,
    ];
  }

  const baseOffset =
    pixelLength < 72
      ? 30
      : pixelLength < 120
        ? 24
        : 18;

  return [
    baseOffset,
    -baseOffset,
    baseOffset + 10,
    -(baseOffset + 10),
    baseOffset + 20,
    -(baseOffset + 20),
  ];
}

function locationErrorMessage(
  error: GeolocationPositionError,
  language: AppLanguage,
): string {
  const text =
    MAP_TEXT[
      language
    ];

  if (
    error.code ===
    error.PERMISSION_DENIED
  ) {
    return text.locationDenied;
  }

  if (
    error.code ===
    error.POSITION_UNAVAILABLE
  ) {
    return text.locationUnavailable;
  }

  if (
    error.code ===
    error.TIMEOUT
  ) {
    return text.locationTimeout;
  }

  return text.locationUnavailable;
}

function Icon({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function Map({
  language,
  lotName = "",
  initialCoordinates,
  initialDrawingObjects,
  initialActiveObjectId,
  onPolygonChange,
  onDrawingObjectsChange,
  onManualPointsChange,
  onActiveObjectChange,
  onSaveLot,
  onExportPdf,
  onExportKml,
  onExportDxf,
  isSavingLot = false,
  isExportingPdf = false,
  hasUnsavedChanges = false,
  onOpenLotPanel,
  onLanguageChange,
  onAreaUnitChange,
  onMapViewChange,
}: MapProps) {
  const mapContainerRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const mapRef =
    useRef<LeafletMap | null>(
      null,
    );

  const leafletRef =
    useRef<
      typeof import(
        "leaflet"
      ) | null
    >(null);

  const baseLayerRef =
    useRef<Layer | null>(
      null,
    );

  const pdfSnapshotViewRef =
    useRef<{
      centre: [number, number];
      zoom: number;
    } | null>(null);

  const pdfSnapshotModeRef =
    useRef(false);

  const pdfSnapshotOverviewOnlyRef =
    useRef(false);

  const drawingLayerRef =
    useRef<LayerGroup | null>(
      null,
    );

  const dashedLineLayerRef =
    useRef<LayerGroup | null>(
      null,
    );

  const manualPointLayerRef =
    useRef<LayerGroup | null>(
      null,
    );

  const locationLayerRef =
    useRef<LayerGroup | null>(
      null,
    );

  const coordinateMarkerLayerRef =
    useRef<LayerGroup | null>(
      null,
    );

  const pointsRef =
    useRef<
      CoordinatePair[]
    >([]);

  const drawingRef =
    useRef(
      false,
    );

  const polygonFinishedRef =
    useRef(
      false,
    );

  const editingRef =
    useRef(
      false,
    );

  const activeFieldToolRef =
    useRef<ActiveFieldTool>(
      null,
    );

  const dashedLinesRef =
    useRef<
      DashedLineFeature[]
    >([]);

  const dashedDraftRef =
    useRef<
      CoordinatePair[]
    >([]);

  const manualPointsRef =
    useRef<
      ManualFieldPoint[]
    >([]);

  const drawingObjectsRef =
    useRef<DrawingObject[]>([]);

  const activeObjectIdRef =
    useRef<string | null>(
      null,
    );

  const draftLineStyleRef =
    useRef<DrawingLineStyle>(
      "solid",
    );

  const polygonSequenceRef =
    useRef(0);

  const lineSequenceRef =
    useRef(0);

  const dashedLineSequenceRef =
    useRef<
      Record<DashedLineCategory, number>
    >({
      proposed_boundary: 0,
      proposed_access: 0,
      road_reserve: 0,
      setback: 0,
      reference_line: 0,
    });

  const callbackRef =
    useRef(
      onPolygonChange,
    );

  const drawingObjectsCallbackRef =
    useRef(
      onDrawingObjectsChange,
    );

  const manualPointsCallbackRef =
    useRef(
      onManualPointsChange,
    );

  const activeObjectCallbackRef =
    useRef(
      onActiveObjectChange,
    );

  const languageRef =
    useRef(
      language,
    );

  const lotNameRef =
    useRef(
      lotName,
    );

  const distanceUnitRef =
    useRef<DistanceUnit>(
      "m",
    );

  const areaUnitRef =
    useRef<AreaUnit>(
      "m2",
    );

  const baseMapRef =
    useRef<BaseMapId>(
      DEFAULT_BASEMAP,
    );

  const locationWatchRef =
    useRef<number | null>(
      null,
    );

  const locationCentredRef =
    useRef(
      false,
    );

  const mapViewChangeRef =
    useRef(onMapViewChange);

  const [
    mapReady,
    setMapReady,
  ] =
    useState(
      false,
    );

  const [
    isDrawing,
    setIsDrawing,
  ] =
    useState(
      false,
    );

  const [
    pointCount,
    setPointCount,
  ] =
    useState(
      0,
    );

  const [
    isEditing,
    setIsEditing,
  ] =
    useState(
      false,
    );

  const [
    activeFieldTool,
    setActiveFieldTool,
  ] =
    useState<ActiveFieldTool>(
      null,
    );

  const [
    drawingObjects,
    setDrawingObjects,
  ] =
    useState<DrawingObject[]>(
      [],
    );

  const [
    activeObjectId,
    setActiveObjectId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    drawMenuOpen,
    setDrawMenuOpen,
  ] =
    useState(false);

  const [
    addMoreMenuOpen,
    setAddMoreMenuOpen,
  ] =
    useState(false);

  const [
    editMenuOpen,
    setEditMenuOpen,
  ] =
    useState(false);

  const [
    exportMenuOpen,
    setExportMenuOpen,
  ] =
    useState(false);

  const [
    dashedLineCount,
    setDashedLineCount,
  ] =
    useState(
      0,
    );

  const [
    dashedDraftCount,
    setDashedDraftCount,
  ] =
    useState(
      0,
    );

  const [
    dashedLineCategory,
    setDashedLineCategory,
  ] =
    useState<DashedLineCategory>(
      "proposed_boundary",
    );

  const [
    manualPointCount,
    setManualPointCount,
  ] =
    useState(
      0,
    );

  const [
    manualPointVersion,
    setManualPointVersion,
  ] =
    useState(
      0,
    );

  const [
    selectedManualPointId,
    setSelectedManualPointId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    manualPointCategory,
    setManualPointCategory,
  ] =
    useState<FieldPointCategory>(
      "boundary_mark",
    );

  const [
    areaM2,
    setAreaM2,
  ] =
    useState(
      0,
    );

  const [
    distanceUnit,
    setDistanceUnit,
  ] =
    useState<DistanceUnit>(
      "m",
    );

  const [
    areaUnit,
    setAreaUnit,
  ] =
    useState<AreaUnit>(
      "m2",
    );

  const [
    baseMap,
    setBaseMap,
  ] =
    useState<BaseMapId>(
      DEFAULT_BASEMAP,
    );

  const [
    settingsOpen,
    setSettingsOpen,
  ] =
    useState(
      false,
    );

  const [
    objectsPanelOpen,
    setObjectsPanelOpen,
  ] =
    useState(false);

  const previousSavingRef =
    useRef(isSavingLot);

  const [
    isTracking,
    setIsTracking,
  ] =
    useState(
      false,
    );

  const [
    locationAccuracy,
    setLocationAccuracy,
  ] =
    useState<number | null>(
      null,
    );

  const [
    locationStatus,
    setLocationStatus,
  ] =
    useState<string>(
      MAP_TEXT[
        language
      ].locationNotTracked,
    );

  const [
    message,
    setMessage,
  ] =
    useState<string>(
      MAP_TEXT[
        language
      ].mapReady,
    );

  const [
    searchValue,
    setSearchValue,
  ] =
    useState(
      "",
    );

  const [
    searchBusy,
    setSearchBusy,
  ] =
    useState(
      false,
    );

  const [
    searchMessage,
    setSearchMessage,
  ] =
    useState(
      "",
    );

  const text =
    MAP_TEXT[
      language
    ];

  const coordinatePairsToCoordinates = (
    points: CoordinatePair[],
  ): Coordinate[] =>
    points.map(
      ([
        lat,
        lng,
      ]) => ({
        lat,
        lng,
      }),
    );

  const coordinatesToPairs = (
    coordinates: Coordinate[],
  ): CoordinatePair[] =>
    coordinates.map(
      (coordinate) => [
        coordinate.lat,
        coordinate.lng,
      ],
    );

  const createDrawingObjectId =
    () => {
      if (
        typeof crypto !== "undefined" &&
        "randomUUID" in crypto
      ) {
        return crypto.randomUUID();
      }

      return `drawing-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;
    };

  const calculateLineLength = (
    points: CoordinatePair[],
  ) =>
    points.reduce(
      (
        total,
        point,
        index,
      ) => {
        const nextPoint =
          points[index + 1];

        return nextPoint
          ? total +
              calculateDistance(
                point,
                nextPoint,
              )
          : total;
      },
      0,
    );

  const nextPolygonName = () => {
    const polygons =
      drawingObjectsRef.current.filter(
        (object) =>
          object.geometryType ===
          "polygon",
      );

    if (
      polygons.length === 0
    ) {
      polygonSequenceRef.current =
        Math.max(
          polygonSequenceRef.current,
          1,
        );
      return "Parent Lot";
    }

    polygonSequenceRef.current =
      Math.max(
        polygonSequenceRef.current +
          1,
        2,
      );
    const nextNumber =
      polygonSequenceRef.current -
      1;

    return `Proposed Lot ${nextNumber}`;
  };

  const isDefaultPolygonName = (
    name: string,
  ) =>
    name === "Parent Lot" ||
    /^Proposed Lot \d+$/.test(
      name,
    );

  const nextLineName = () => {
    lineSequenceRef.current += 1;
    const nextNumber =
      lineSequenceRef.current;

    return `Line ${nextNumber}`;
  };

  const nextDashedLineName = (
    category: DashedLineCategory,
  ) => {
    const label =
      dashedCategoryLabel(
        category,
      );
    dashedLineSequenceRef.current[
      category
    ] += 1;
    const nextNumber =
      dashedLineSequenceRef.current[
        category
      ];

    return `${label} ${nextNumber}`;
  };

  const syncDrawingSequences = (
    objects: DrawingObject[],
  ) => {
    objects.forEach(
      (object) => {
        if (
          object.geometryType ===
          "polygon"
        ) {
          if (
            object.name === "Parent Lot"
          ) {
            polygonSequenceRef.current =
              Math.max(
                polygonSequenceRef.current,
                1,
              );
            return;
          }

          const match =
            /^Proposed Lot (\d+)$/.exec(
              object.name,
            );

          if (match) {
            polygonSequenceRef.current =
              Math.max(
                polygonSequenceRef.current,
                Number(match[1]) + 1,
              );
          }
          return;
        }

        if (
          object.geometryType !== "line"
        ) {
          return;
        }

        if (
          object.lineStyle === "solid"
        ) {
          const match =
            /^Line (\d+)$/.exec(
              object.name,
            );

          if (match) {
            lineSequenceRef.current =
              Math.max(
                lineSequenceRef.current,
                Number(match[1]),
              );
          }
          return;
        }

        if (
          object.lineStyle !== "dashed"
        ) {
          return;
        }

        const category =
          object.category as DashedLineCategory;

        if (
          !(
            category in
            dashedLineSequenceRef.current
          )
        ) {
          return;
        }

        const label =
          dashedCategoryLabel(
            category,
          );
        const escapedLabel =
          label.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&",
          );
        const pattern =
          new RegExp(
            `^${escapedLabel} (\\d+)$`,
          );
        const match =
          pattern.exec(
            object.name,
          );

        if (match) {
          dashedLineSequenceRef.current[
            category
          ] =
            Math.max(
              dashedLineSequenceRef
                .current[category],
              Number(match[1]),
            );
        }
      },
    );
  };

  const nextPolygonCategory =
    (): DrawingObjectCategory =>
      drawingObjectsRef.current.some(
        (object) =>
          object.geometryType ===
          "polygon",
      )
        ? "proposed_lot"
        : "parent_lot";

  const publishDrawingObjects = (
    nextObjects: DrawingObject[],
    nextActiveId = activeObjectIdRef.current,
    options: {
      markUnsaved?: boolean;
    } = {},
  ) => {
    drawingObjectsRef.current =
      nextObjects;
    activeObjectIdRef.current =
      nextActiveId;
    setDrawingObjects(
      nextObjects,
    );
    setActiveObjectId(
      nextActiveId,
    );
    activeObjectCallbackRef.current?.(
      nextActiveId,
    );
    setDashedLineCount(
      nextObjects.filter(
        (object) =>
          object.geometryType ===
            "line" &&
          object.lineStyle ===
            "dashed",
      ).length,
    );
    drawingObjectsCallbackRef.current?.(
      nextObjects,
      {
        markUnsaved:
          options.markUnsaved ?? true,
      },
    );
  };

  const patchDrawingObject = (
    objectId: string,
    updater: (
      object: DrawingObject,
    ) => DrawingObject,
  ) => {
    const nextObjects =
      drawingObjectsRef.current.map(
        (object) =>
          object.id === objectId
            ? updater(object)
            : object,
      );

    publishDrawingObjects(
      nextObjects,
    );
  };

  const renamePolygonObject = (
    objectId: string,
    nextName: string,
  ) => {
    const trimmedName =
      nextName.trim();

    if (
      trimmedName.length === 0 ||
      trimmedName.length > 60
    ) {
      setMessage(
        "Please enter a valid lot name.",
      );
      return;
    }

    const object =
      drawingObjectsRef.current.find(
        (currentObject) =>
          currentObject.id ===
          objectId,
      );

    if (
      !object ||
      object.geometryType !==
        "polygon" ||
      object.name === trimmedName
    ) {
      return;
    }

    patchDrawingObject(
      objectId,
      (currentObject) =>
        currentObject.geometryType ===
        "polygon"
          ? {
              ...currentObject,
              name: trimmedName,
              updatedAt:
                new Date().toISOString(),
            }
          : currentObject,
    );
    setMessage(
      `${trimmedName} renamed.`,
    );
    redrawPolygon();
  };

  const selectDrawingObject = (
    objectId: string,
  ) => {
    if (
      drawingRef.current
    ) {
      setMessage(
        "Complete the current drawing first.",
      );
      return;
    }

    const object =
      drawingObjectsRef.current.find(
        (currentObject) =>
          currentObject.id === objectId,
      );

    if (!object) {
      return;
    }

    activeObjectIdRef.current =
      object.id;
    setActiveObjectId(
      object.id,
    );
    activeObjectCallbackRef.current?.(
      object.id,
    );
    setActiveTool(
      null,
    );
    editingRef.current =
      false;
    setIsEditing(
      false,
    );
    pointsRef.current =
      coordinatesToPairs(
        object.coordinates,
      );
    polygonFinishedRef.current =
      object.geometryType ===
      "polygon";
    setPointCount(
      object.coordinates.length,
    );
    setAreaM2(
      object.geometryType === "polygon"
        ? object.areaSqm
        : 0,
    );
    setMessage(
      `${object.name} selected.`,
    );
    redrawPolygon();
    updateParentPolygon();
  };

  const createPolygonObject = (
    points: CoordinatePair[],
    existing?: PolygonDrawingObject,
  ): PolygonDrawingObject => {
    const now =
      new Date().toISOString();
    const result =
      createPolygonResult(
        points,
        distanceUnitRef.current,
        areaUnitRef.current,
        languageRef.current,
        baseMapRef.current,
      );
    return {
      id:
        existing?.id ??
        createDrawingObjectId(),
      geometryType:
        "polygon",
      name:
        existing?.name ??
        nextPolygonName(),
      category:
        existing?.category ??
        nextPolygonCategory(),
      coordinates:
        result.coordinates,
      lineStyle:
        existing?.lineStyle ??
        "solid",
      color:
        existing?.color ??
        WEB_DRAWING_LINE_COLOR,
      weight:
        existing?.weight ??
        4,
      isVisible:
        existing?.isVisible ?? true,
      createdAt:
        existing?.createdAt ?? now,
      updatedAt:
        now,
      areaSqm:
        result.areaM2,
      areaHa:
        result.areaHa,
      areaAcre:
        result.areaAcre,
      perimeterM:
        result.perimeterM,
    };
  };

  const createLineObject = (
    points: CoordinatePair[],
    lineStyle: DrawingLineStyle,
    category: DrawingObjectCategory,
    existing?: LineDrawingObject,
  ): LineDrawingObject => {
    const now =
      new Date().toISOString();
    const startPoint =
      points[0];
    const secondPoint =
      points[1];
    const penultimatePoint =
      points[points.length - 2];
    const endPoint =
      points[points.length - 1];

    return {
      id:
        existing?.id ??
        createDrawingObjectId(),
      geometryType:
        "line",
      name:
        existing?.name ??
        (
          lineStyle === "dashed" &&
          category !== "standard_line"
            ? nextDashedLineName(
                category as DashedLineCategory,
              )
            : nextLineName()
        ),
      category,
      coordinates:
        coordinatePairsToCoordinates(
          points,
        ),
      lineStyle,
      color:
        existing?.color ??
        (
          lineStyle === "dashed"
            ? DASHED_LINE_STYLE.color
            : WEB_DRAWING_LINE_COLOR
        ),
      weight:
        existing?.weight ??
        (
          lineStyle === "dashed"
            ? DASHED_LINE_STYLE.weight
            : 4
        ),
      isVisible:
        existing?.isVisible ?? true,
      createdAt:
        existing?.createdAt ?? now,
      updatedAt:
        now,
      lengthM:
        calculateLineLength(
          points,
        ),
      startBearing:
        startPoint && secondPoint
          ? calculateBearing(
              startPoint,
              secondPoint,
            )
          : null,
      endBearing:
        penultimatePoint && endPoint
          ? calculateBearing(
              penultimatePoint,
              endPoint,
            )
          : null,
    };
  };

  const getPrimaryPolygon = () =>
    drawingObjectsRef.current.find(
      (
        object,
      ): object is PolygonDrawingObject =>
        object.geometryType ===
          "polygon" &&
        object.isVisible,
    ) ??
    drawingObjectsRef.current.find(
      (
        object,
      ): object is PolygonDrawingObject =>
        object.geometryType ===
        "polygon",
    );

  const updateParentPolygon =
    () => {
      const activeObject =
        activeObjectIdRef.current
          ? drawingObjectsRef.current.find(
              (object) =>
                object.id ===
                activeObjectIdRef.current,
            )
          : null;

      const points =
        sanitizePoints(
          pointsRef.current.length > 0
            ? pointsRef.current
            : activeObject
              ? coordinatesToPairs(
                  activeObject.coordinates,
                )
              : [],
        );

      if (
        points.length >=
          3 &&
        polygonFinishedRef.current
      ) {
        callbackRef.current(
          createPolygonResult(
            points,
            distanceUnitRef.current,
            areaUnitRef.current,
            languageRef.current,
            baseMapRef.current,
          ),
        );

        return;
      }

      const primaryPolygon =
        getPrimaryPolygon();

      callbackRef.current(
        primaryPolygon
          ? createPolygonResult(
              coordinatesToPairs(
                primaryPolygon.coordinates,
              ),
              distanceUnitRef.current,
              areaUnitRef.current,
              languageRef.current,
              baseMapRef.current,
            )
          : null,
      );
    };

  const setActiveTool = (
    tool: ActiveFieldTool,
  ) => {
    activeFieldToolRef.current =
      tool;
    setActiveFieldTool(
      tool,
    );
  };

  const createDashedLineId =
    () =>
      `dash-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

  const createFieldPointId =
    () =>
      `point-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`;

  const nextManualPointCode =
    () =>
      `P${manualPointsRef.current.length + 1}`;

  const dashedCategoryLabel = (
    category: DashedLineCategory,
  ) =>
    DASHED_LINE_CATEGORIES.find(
      (definition) =>
        definition.value === category,
    )?.label ?? "Dashed Line";

  const fieldPointCategoryLabel = (
    category: FieldPointCategory,
  ) =>
    FIELD_POINT_CATEGORIES.find(
      (definition) =>
        definition.value === category,
    )?.label ?? "Point";

  const refreshManualPointState =
    () => {
      setManualPointCount(
        manualPointsRef.current.length,
      );
      setManualPointVersion(
        (current) =>
          current + 1,
      );
      manualPointsCallbackRef.current?.(
        manualPointsRef.current.map(
          (point) => ({
            id: point.id,
            pointCode:
              point.pointCode,
            pointName:
              point.pointName,
            category:
              point.category,
            coordinate: {
              lat:
                point.coordinate[0],
              lng:
                point.coordinate[1],
            },
            isVisible:
              point.isVisible,
          }),
        ),
      );
    };

  const redrawManualPoints =
    () => {
      const L =
        leafletRef.current;
      const manualPointLayer =
        manualPointLayerRef.current;

      if (
        !L ||
        !manualPointLayer
      ) {
        return;
      }

      manualPointLayer.clearLayers();

      if (
        pdfSnapshotModeRef.current ||
        pdfSnapshotOverviewOnlyRef.current
      ) {
        return;
      }

      manualPointsRef.current.forEach(
        (point) => {
          if (!point.isVisible) {
            return;
          }

          const isSelected =
            selectedManualPointId ===
            point.id;
          const marker =
            L.marker(
              point.coordinate,
              {
                draggable:
                  activeFieldToolRef.current ===
                  "add_point",
                keyboard:
                  false,
                icon:
                  L.divIcon({
                    className:
                      "sl-manual-point-icon",
                    html: `
                      <button
                        type="button"
                        class="sl-manual-point-marker ${
                          isSelected
                            ? "is-selected"
                            : ""
                        }"
                        title="${escapeHtml(
                          point.pointCode,
                        )}"
                      >
                        ${escapeHtml(
                          point.pointCode,
                        )}
                      </button>
                    `,
                    iconSize:
                      [1, 1],
                    iconAnchor:
                      [0, 0],
                  }),
              },
            ).addTo(
              manualPointLayer,
            );

          marker.on(
            "click",
            () => {
              setSelectedManualPointId(
                point.id,
              );
              window.setTimeout(
                redrawManualPoints,
                0,
              );
            },
          );

          marker.on(
            "dragend",
            () => {
              const nextPoint =
                marker.getLatLng();

              manualPointsRef.current =
                manualPointsRef.current.map(
                  (currentPoint) =>
                    currentPoint.id ===
                    point.id
                      ? {
                          ...currentPoint,
                          coordinate: [
                            nextPoint.lat,
                            nextPoint.lng,
                          ],
                        }
                      : currentPoint,
                );
              refreshManualPointState();
              redrawManualPoints();
            },
          );
        },
      );
    };

  const updateManualPoint = (
    pointId: string,
    updates: Partial<
      Pick<
        ManualFieldPoint,
        | "pointName"
        | "category"
        | "notes"
        | "isVisible"
      >
    >,
  ) => {
    manualPointsRef.current =
      manualPointsRef.current.map(
        (point) =>
          point.id === pointId
            ? {
                ...point,
                ...updates,
              }
            : point,
      );
    refreshManualPointState();
    redrawManualPoints();
  };

  const deleteManualPoint = (
    pointId: string,
  ) => {
    manualPointsRef.current =
      manualPointsRef.current.filter(
        (point) =>
          point.id !== pointId,
      );
    setSelectedManualPointId(
      null,
    );
    refreshManualPointState();
    redrawManualPoints();
    setMessage(
      "Point deleted.",
    );
  };

  const redrawDashedLines =
    () => {
      const L =
        leafletRef.current;
      const dashedLayer =
        dashedLineLayerRef.current;

      if (
        !L ||
        !dashedLayer
      ) {
        return;
      }

      dashedLayer.clearLayers();

      if (
        pdfSnapshotModeRef.current ||
        pdfSnapshotOverviewOnlyRef.current
      ) {
        return;
      }

      const renderLine = (
        line: DashedLineFeature,
        isDraft = false,
      ) => {
        if (
          line.coordinates.length < 2
        ) {
          return;
        }

        L.polyline(
          line.coordinates,
          {
            color:
              isDraft
                ? WEB_DRAWING_LINE_COLOR
                : DASHED_LINE_STYLE.color,
            weight:
              DASHED_LINE_STYLE.weight,
            dashArray:
              DASHED_LINE_STYLE.dashArray,
            opacity:
              isDraft
                ? 0.78
                : 0.95,
            lineCap:
              "butt",
            lineJoin:
              "round",
            interactive:
              false,
          },
        ).addTo(
          dashedLayer,
        );

      };

      const renderDashedSegmentLabels = (
        line: DashedLineFeature,
      ) => {
        const map =
          mapRef.current;

        if (
          !map ||
          line.coordinates.length < 2
        ) {
          return;
        }

        const occupied:
          LabelBox[] = [];
        const currentLanguage =
          languageRef.current;

        line.coordinates.forEach(
          (point) => {
            const pointPixel =
              map.latLngToContainerPoint(
                L.latLng(
                  point[0],
                  point[1],
                ),
              );

            occupied.push(
              simpleBox(
                pointPixel.x,
                pointPixel.y,
                28,
                24,
              ),
            );
          },
        );

        for (
          let index = 0;
          index <
          line.coordinates.length - 1;
          index += 1
        ) {
          const start =
            line.coordinates[index];
          const end =
            line.coordinates[
              index + 1
            ];

          if (
            !start ||
            !end
          ) {
            continue;
          }

          const startPixel =
            map.latLngToContainerPoint(
              L.latLng(
                start[0],
                start[1],
              ),
            );
          const endPixel =
            map.latLngToContainerPoint(
              L.latLng(
                end[0],
                end[1],
              ),
            );
          const dx =
            endPixel.x -
            startPixel.x;
          const dy =
            endPixel.y -
            startPixel.y;
          const pixelLength =
            Math.sqrt(
              dx ** 2 +
                dy ** 2,
            );
          const distanceM =
            calculateDistance(
              start,
              end,
            );

          if (
            distanceM <
            MIN_SEGMENT_METERS
          ) {
            continue;
          }

          let angle =
            radiansToDegrees(
              Math.atan2(
                dy,
                dx,
              ),
            );

          angle =
            readableSegmentAngle(
              angle,
            );

          const midpoint:
            CoordinatePair = [
              (
                start[0] +
                end[0]
              ) / 2,
              (
                start[1] +
                end[1]
              ) / 2,
            ];
          const centreX =
            (
              startPixel.x +
              endPixel.x
            ) / 2;
          const centreY =
            (
              startPixel.y +
              endPixel.y
            ) / 2;
          const normalLength =
            Math.max(
              pixelLength,
              1,
            );
          const normalX =
            -dy / normalLength;
          const normalY =
            dx / normalLength;
          const bearing =
            bearingToDms(
              calculateBearing(
                start,
                end,
              ),
            );
          const distanceText =
            formatNumber(
              distanceM,
              2,
              currentLanguage,
            );
          const unitText =
            "m";
          const labelWidth =
            Math.max(
              pixelLength < 72
                ? 78
                : 98,
              bearing.length *
                (pixelLength < 72
                  ? 6.2
                  : 7.2),
              distanceText.length *
                (pixelLength < 72
                  ? 6.2
                  : 7.2),
            );
          const labelHeight =
            pixelLength < 72
              ? 12
              : 14;
          const edgeOffset =
            pixelLength < 72
              ? 8
              : 10;
          const centreOffset =
            edgeOffset +
            labelHeight / 2;
          const renderSingleDashedLabel =
            (
              text: string,
              className: string,
              offsetSign: 1 | -1,
            ) => {
              const labelOffset =
                centreOffset *
                offsetSign;
            const box =
              rotatedBox(
                centreX +
                  normalX *
                    labelOffset,
                centreY +
                  normalY *
                    labelOffset,
                labelWidth,
                labelHeight,
                angle,
              );

              occupied.push(
                box,
              );

          L.marker(
            midpoint,
            {
              icon:
                L.divIcon({
                  className:
                    "sl-survey-label-icon",
                  html: `
                    <div
                      class="sl-survey-label ${
                        pixelLength < 100
                          ? "is-compact"
                          : ""
                      } ${
                        pixelLength < 72
                          ? "is-short"
                          : ""
                      }"
                      data-object-id="${escapeHtml(
                        line.id,
                      )}"
                      data-segment-index="${index}"
                      style="
                        --sl-segment-angle:${angle}deg;
                        --sl-label-x:${normalX * labelOffset}px;
                        --sl-label-y:${normalY * labelOffset}px;
                      "
                    >
                      <span class="${className}">
                        ${text}
                      </span>
                    </div>
                  `,
                  iconSize:
                    [1, 1],
                  iconAnchor:
                    [0, 0],
                }),
              interactive:
                false,
              keyboard:
                false,
            },
          ).addTo(
            dashedLayer,
          );
            };

          renderSingleDashedLabel(
            bearing,
            "sl-survey-bearing",
            -1,
          );
          renderSingleDashedLabel(
            `${distanceText} ${unitText}`,
            "sl-survey-distance",
            1,
          );
        }
      };

      dashedLinesRef.current.forEach(
        (line) => {
          renderLine(
            line,
          );
          renderDashedSegmentLabels(
            line,
          );

          if (
            activeFieldToolRef.current ===
            "dashed_line"
          ) {
            line.coordinates.forEach(
              (
                point,
                pointIndex,
              ) => {
                const vertexMarker =
                  L.marker(
                    point,
                    {
                      draggable:
                        true,
                      keyboard:
                        false,
                      autoPan:
                        true,
                      icon:
                        L.divIcon({
                        className:
                          "",
                        html:
                          '<span style="display:block;width:18px;height:18px;border:2px solid #B91C1C;border-radius:999px;background:#ffffff;box-shadow:0 2px 8px rgba(15,23,42,.22);touch-action:none"></span>',
                          iconSize:
                            [18, 18],
                          iconAnchor:
                            [9, 9],
                        }),
                    },
                  ).addTo(
                    dashedLayer,
                  );

                vertexMarker.on(
                  "dragend",
                  () => {
                    const nextPoint =
                      vertexMarker.getLatLng();

                    dashedLinesRef.current =
                      dashedLinesRef.current.map(
                        (currentLine) =>
                          currentLine.id ===
                          line.id
                            ? {
                                ...currentLine,
                                coordinates:
                                  currentLine.coordinates.map(
                                    (
                                      coordinate,
                                      coordinateIndex,
                                    ) =>
                                      coordinateIndex ===
                                      pointIndex
                                        ? [
                                            nextPoint.lat,
                                            nextPoint.lng,
                                          ]
                                        : coordinate,
                                  ),
                              }
                            : currentLine,
                      );

                    redrawDashedLines();
                  },
                );
              },
            );
          }
        },
      );

      if (
        dashedDraftRef.current.length >
        0
      ) {
        const draftFeature: DashedLineFeature = {
          id:
            "draft",
          category:
            dashedLineCategory,
          coordinates:
            dashedDraftRef.current,
          createdAt:
            new Date().toISOString(),
        };

        renderLine(
          draftFeature,
          true,
        );
        renderDashedSegmentLabels(
          draftFeature,
        );

        dashedDraftRef.current.forEach(
          (point) => {
            L.circleMarker(
              point,
              {
                radius:
                  5,
                color:
                  WEB_DRAWING_LINE_COLOR,
                weight:
                  2,
                fillColor:
                  "#ffffff",
                fillOpacity:
                  1,
                interactive:
                  false,
              },
            ).addTo(
              dashedLayer,
            );
          },
        );
      }
    };

  const redrawPolygon =
    () => {
      const L =
        leafletRef.current;

      const map =
        mapRef.current;

      const drawingLayer =
        drawingLayerRef.current;

      if (
        !L ||
        !map ||
        !drawingLayer
      ) {
        return;
      }

      const currentLanguage =
        languageRef.current;

      const currentText =
        MAP_TEXT[
          currentLanguage
        ];

      const points =
        sanitizePoints(
          pointsRef.current,
        );

      const occupied:
        LabelBox[] = [];

      drawingLayer.clearLayers();

      if (
        pdfSnapshotOverviewOnlyRef.current
      ) {
        return;
      }

      const activeObject =
        activeObjectIdRef.current
          ? drawingObjectsRef.current.find(
              (object) =>
                object.id ===
                activeObjectIdRef.current,
            ) ?? null
          : null;

      const activeGeometry =
        drawingRef.current
          ? activeFieldToolRef.current ===
              "line" ||
            activeFieldToolRef.current ===
              "dashed_line"
            ? "line"
            : "polygon"
          : activeObject?.geometryType ??
            (
              polygonFinishedRef.current
                ? "polygon"
                : null
            );

      const renderObjectLabel = (
        object: DrawingObject,
        point: CoordinatePair,
        metricText: string,
      ) => {
        if (
          object.category ===
          "proposed_boundary"
        ) {
          return;
        }

        L.marker(
          point,
          {
            icon:
              L.divIcon({
                className:
                  "sl-drawing-object-label-icon",
                html: `<span class="sl-drawing-object-label">${escapeHtml(
                  metricText,
                )}</span>`,
                iconSize:
                  [1, 1],
                iconAnchor:
                  [0, 0],
              }),
            interactive:
              false,
            keyboard:
              false,
          },
        ).addTo(
          drawingLayer,
        );
      };

      const renderLineObjectLabel = (
        detail: {
          objectId: string;
          name: string;
          metricText: string;
          points: CoordinatePair[];
        },
      ) => {
        if (
          detail.points.length < 2 ||
          detail.name ===
            "Proposed Boundary"
        ) {
          return;
        }

        const start =
          detail.points[0];
        const end =
          detail.points[
            detail.points.length - 1
          ];
        const firstNext =
          detail.points[1];
        const startPixel =
          map.latLngToContainerPoint(
            L.latLng(
              start[0],
              start[1],
            ),
          );
        const nextPixel =
          map.latLngToContainerPoint(
            L.latLng(
              firstNext[0],
              firstNext[1],
            ),
          );
        const dx =
          nextPixel.x - startPixel.x;
        const dy =
          nextPixel.y - startPixel.y;
        const length =
          Math.max(
            Math.sqrt(
              dx ** 2 +
                dy ** 2,
            ),
            1,
          );
        const normalX =
          -dy / length;
        const normalY =
          dx / length;
        const outwardX =
          -dx / length;
        const outwardY =
          -dy / length;
        const labelWidth =
          Math.max(
            84,
            Math.min(
              132,
              detail.name.length * 7 +
                detail.metricText.length *
                  4.5,
            ),
          );
        const labelHeight =
          30;
        const candidates = [
          {
            x:
              outwardX * 18 +
              normalX * 34,
            y:
              outwardY * 18 +
              normalY * 34,
          },
          {
            x:
              outwardX * 22 -
              normalX * 38,
            y:
              outwardY * 22 -
              normalY * 38,
          },
          {
            x:
              outwardX * 44,
            y:
              outwardY * 44,
          },
        ];
        const selected =
          candidates.find(
            (candidate) =>
              canUseBox(
                simpleBox(
                  startPixel.x +
                    candidate.x,
                  startPixel.y +
                    candidate.y,
                  labelWidth,
                  labelHeight,
                ),
                occupied,
              ),
          ) ??
          candidates[0];
        const labelBox =
          simpleBox(
            startPixel.x +
              selected.x,
            startPixel.y +
              selected.y,
            labelWidth,
            labelHeight,
          );
        const labelPoint =
          map.containerPointToLatLng(
            L.point(
              startPixel.x +
                selected.x,
              startPixel.y +
                selected.y,
            ),
          );

        occupied.push(
          labelBox,
        );

        L.marker(
          [
            labelPoint.lat,
            labelPoint.lng,
          ],
          {
            icon:
              L.divIcon({
                className:
                  "sl-drawing-object-label-icon",
                html: `<span class="sl-drawing-object-label" data-object-id="${escapeHtml(
                  detail.objectId,
                )}">${escapeHtml(
                  detail.name,
                )}<small>${escapeHtml(
                  detail.metricText,
                )}</small></span>`,
                iconSize:
                  [1, 1],
                iconAnchor:
                  [0, 0],
              }),
            interactive:
              false,
            keyboard:
              false,
          },
        ).addTo(
          drawingLayer,
        );
      };

      const renderSegmentLabels = (
        detail: {
          objectId: string;
          points: CoordinatePair[];
          closed: boolean;
          showDistance?: boolean;
          lineStyle?: DrawingLineStyle;
        },
      ) => {
        const showDistance =
          detail.showDistance ??
          true;
        const isLineAnnotation =
          !detail.closed;
        const segmentCount =
          detail.closed
            ? detail.points.length
            : Math.max(
                0,
                detail.points.length -
                  1,
              );
        const minimumPixels =
          minimumSegmentPixels(
            map.getZoom(),
          );

        detail.points.forEach(
          (point) => {
            const pointPixel =
              map.latLngToContainerPoint(
                L.latLng(
                  point[0],
                  point[1],
                ),
              );

            occupied.push(
              simpleBox(
                pointPixel.x,
                pointPixel.y,
                32,
                28,
              ),
            );
          },
        );

        for (
          let index = 0;
          index < segmentCount;
          index += 1
        ) {
          const start =
            detail.points[index];
          const end =
            detail.closed
              ? detail.points[
                  (
                    index + 1
                  ) %
                    detail.points.length
                ]
              : detail.points[
                  index + 1
                ];

          if (
            !start ||
            !end
          ) {
            continue;
          }

          const startPixel =
            map.latLngToContainerPoint(
              L.latLng(
                start[0],
                start[1],
              ),
            );
          const endPixel =
            map.latLngToContainerPoint(
              L.latLng(
                end[0],
                end[1],
              ),
            );
          const dx =
            endPixel.x -
            startPixel.x;
          const dy =
            endPixel.y -
            startPixel.y;
          const pixelLength =
            Math.sqrt(
              dx ** 2 +
                dy ** 2,
            );

          if (
            !isLineAnnotation &&
            pixelLength <
            minimumPixels
          ) {
            continue;
          }

          const distanceM =
            calculateDistance(
              start,
              end,
            );

          if (
            distanceM <
            MIN_SEGMENT_METERS
          ) {
            continue;
          }

          let angle =
            radiansToDegrees(
              Math.atan2(
                dy,
                dx,
              ),
            );

          angle =
            readableSegmentAngle(
              angle,
            );

          const midpoint:
            CoordinatePair = [
              (
                start[0] +
                end[0]
              ) / 2,
              (
                start[1] +
                end[1]
              ) / 2,
            ];
          const centreX =
            (
              startPixel.x +
              endPixel.x
            ) / 2;
          const centreY =
            (
              startPixel.y +
              endPixel.y
            ) / 2;
          const normalLength =
            Math.max(
              pixelLength,
              1,
            );
          const normalX =
            -dy / normalLength;
          const normalY =
            dx / normalLength;
          const bearing =
            bearingToDms(
              calculateBearing(
                start,
                end,
              ),
            );
          const distanceText =
            formatNumber(
              distanceM,
              2,
              currentLanguage,
            );
          const unitText =
            "m";
          const labelWidth =
            Math.max(
              pixelLength < 72
                ? 78
                : 98,
              bearing.length *
                (pixelLength < 72
                  ? 6.2
                  : 7.2),
              distanceText.length *
                (pixelLength < 72
                  ? 6.2
                  : 7.2),
            );
          const labelHeight =
            pixelLength < 72
              ? 12
              : 14;
          const edgeOffset =
            pixelLength < 72
              ? 8
              : 10;
          const centreOffset =
            edgeOffset +
            labelHeight / 2;
          const renderSingleSegmentLabel =
            (
              text: string,
              className: string,
              offsetSign: 1 | -1,
            ) => {
              const labelOffset =
                centreOffset *
                offsetSign;
            const box =
              rotatedBox(
                centreX +
                  normalX *
                    labelOffset,
                centreY +
                  normalY *
                    labelOffset,
                labelWidth,
                labelHeight,
                angle,
              );

              occupied.push(
                box,
              );

          L.marker(
            midpoint,
            {
              icon:
                L.divIcon({
                  className:
                    "sl-survey-label-icon",
                  html: `
                    <div
                      class="sl-survey-label ${
                        pixelLength < 100
                          ? "is-compact"
                          : ""
                      } ${
                        pixelLength < 72
                          ? "is-short"
                          : ""
                      }"
                      data-object-id="${escapeHtml(
                        detail.objectId,
                      )}"
                      data-segment-index="${index}"
                      style="
                        --sl-segment-angle:${angle}deg;
                        --sl-label-x:${normalX * labelOffset}px;
                        --sl-label-y:${normalY * labelOffset}px;
                      "
                    >
                      <span class="${className}">
                        ${text}
                      </span>
                    </div>
                  `,
                  iconSize:
                    [1, 1],
                  iconAnchor:
                    [0, 0],
                }),
              interactive:
                false,
              keyboard:
                false,
            },
          ).addTo(
            drawingLayer,
          );
            };

          renderSingleSegmentLabel(
            bearing,
            "sl-survey-bearing",
            -1,
          );

          if (showDistance) {
            renderSingleSegmentLabel(
              `${distanceText} ${unitText}`,
              "sl-survey-distance",
              1,
            );
          }
        }
      };

      const renderStoredObject = (
        object: DrawingObject,
      ) => {
        if (
        !object.isVisible ||
          (
            object.id ===
              activeObjectIdRef.current &&
            (
              drawingRef.current ||
              editingRef.current
            )
          )
        ) {
          return;
        }

        const objectPoints =
          coordinatesToPairs(
            object.coordinates,
          );

        if (
          objectPoints.length === 0
        ) {
          return;
        }

        const isActiveObject =
          object.id === activeObjectIdRef.current;
        const objectRenderColor =
          isActiveObject
            ? WEB_DRAWING_SELECTED_COLOR
            : WEB_DRAWING_LINE_COLOR;
        const commonOptions = {
          color:
            objectRenderColor,
          weight:
            isActiveObject
              ? Math.max(
                  3,
                  Math.min(
                    object.weight,
                    3,
                  ),
                )
              : Math.max(
                  2,
                  Math.min(
                    object.weight,
                    2,
                  ),
                ),
          opacity:
            isActiveObject
              ? 0.9
              : 0.76,
          dashArray:
            object.lineStyle ===
            "dashed"
              ? DASHED_LINE_STYLE.dashArray
              : object.lineStyle ===
                  "dotted"
                ? "2 8"
                : undefined,
        };

        if (
          object.geometryType ===
            "polygon" &&
          objectPoints.length >= 3
        ) {
          L.polygon(
            objectPoints,
            {
              ...commonOptions,
              fillColor:
                objectRenderColor,
              fillOpacity:
                isActiveObject
                  ? 0.07
                  : 0.045,
            },
          )
            .on(
              "click",
              () =>
                selectDrawingObject(
                  object.id,
                ),
            )
            .addTo(
              drawingLayer,
            );

          const objectArea =
            formatAreaDisplay(
              object.areaSqm,
              areaUnitRef.current,
              currentLanguage,
            );

          renderObjectLabel(
            object,
            polygonCentroid(
              objectPoints,
            ),
            `${objectArea.text} ${objectArea.symbol}`,
          );
          renderSegmentLabels({
            objectId:
              object.id,
            points:
              objectPoints,
            closed:
              true,
          });
          return;
        }

        if (
          object.geometryType ===
            "line" &&
          objectPoints.length >= 2
        ) {
          L.polyline(
            objectPoints,
            {
              ...commonOptions,
              lineCap:
                object.lineStyle ===
                "dashed"
                  ? "butt"
                  : "round",
              lineJoin:
                "round",
            },
          )
            .on(
              "click",
              () =>
                selectDrawingObject(
                  object.id,
                ),
            )
            .addTo(
              drawingLayer,
            );

          renderSegmentLabels({
            objectId:
              object.id,
            points:
              objectPoints,
            closed:
              false,
            lineStyle:
              object.lineStyle,
          });
        }
      };

      drawingObjectsRef.current.forEach(
        renderStoredObject,
      );

      if (
        activeObject &&
        !activeObject.isVisible &&
        !drawingRef.current
      ) {
        setAreaM2(0);
        return;
      }

      if (
        activeGeometry === "line"
      ) {
        const activeLine =
          activeObject?.geometryType ===
          "line"
            ? activeObject
            : null;
        const lineStyle =
          activeLine?.lineStyle ??
          draftLineStyleRef.current;
        const lineColor =
          activeLine
            ? WEB_DRAWING_SELECTED_COLOR
            : WEB_DRAWING_LINE_COLOR;

        if (
          points.length >= 2
        ) {
          L.polyline(
            points,
            {
              color:
                lineColor,
              weight:
                activeLine
                  ? 3
                  : 2,
              opacity:
                1,
              dashArray:
                lineStyle === "dashed"
                  ? DASHED_LINE_STYLE.dashArray
                  : lineStyle === "dotted"
                    ? "2 8"
                    : undefined,
              lineCap:
                lineStyle === "dashed"
                  ? "butt"
                  : "round",
              lineJoin:
                "round",
            },
          ).addTo(
            drawingLayer,
          );
        }

        points.forEach(
          (
            point,
            index,
          ) => {
            if (
              editingRef.current &&
              activeLine
            ) {
              const vertexMarker =
                L.marker(
                  point,
                  {
                    draggable:
                      true,
                    keyboard:
                      false,
                    autoPan:
                      true,
                    icon:
                      L.divIcon({
                        className:
                          "",
                        html:
                          '<span style="display:block;width:18px;height:18px;border:2px solid #B91C1C;border-radius:999px;background:#ffffff;box-shadow:0 3px 10px rgba(15,23,42,.24);touch-action:none"></span>',
                        iconSize:
                          [18, 18],
                        iconAnchor:
                          [9, 9],
                      }),
                  },
                ).addTo(
                  drawingLayer,
                );

              vertexMarker.on(
                "dragend",
                () => {
                  const nextPoint =
                    vertexMarker.getLatLng();
                  const nextPoints:
                    CoordinatePair[] =
                    pointsRef.current.map(
                      (
                        currentPoint,
                        currentIndex,
                      ) =>
                        currentIndex === index
                          ? [
                              nextPoint.lat,
                              nextPoint.lng,
                            ]
                          : currentPoint,
                    );

                  pointsRef.current =
                    nextPoints;
                  patchDrawingObject(
                    activeLine.id,
                    (object) =>
                      object.geometryType ===
                      "line"
                        ? createLineObject(
                            nextPoints,
                            object.lineStyle,
                            object.category,
                            object,
                          )
                        : object,
                  );
                  redrawPolygon();
                },
              );
            } else {
              L.circleMarker(
                point,
                {
                  radius:
                    4,
                  color:
                    lineColor,
                  weight:
                    1.75,
                  fillColor:
                    "#ffffff",
                  fillOpacity:
                    1,
                  interactive:
                    false,
                },
              ).addTo(
                drawingLayer,
              );
            }
          },
        );

        setAreaM2(0);

        if (
          points.length >= 2
        ) {
          renderSegmentLabels({
            objectId:
              activeLine?.id ??
              "line-draft",
            points,
            closed:
              false,
            lineStyle,
          });
        }

        return;
      }

      if (
        points.length ===
          2 &&
        !pdfSnapshotModeRef.current
      ) {
        L.polyline(
          points,
          {
            color:
              WEB_DRAWING_LINE_COLOR,

            weight:
              3,

            opacity:
              1,
          },
        ).addTo(
          drawingLayer,
        );
      }

      if (
        points.length >=
          3 &&
        (
          !pdfSnapshotModeRef.current ||
          polygonFinishedRef.current
        )
      ) {
        if (
          pdfSnapshotModeRef.current
        ) {
          L.polygon(
            points,
            {
              stroke:
                false,

              fillColor:
                "#38bdf8",

              fillOpacity:
                0.14,

              interactive:
                false,
            },
          ).addTo(
            drawingLayer,
          );

          points.forEach(
            (
              point,
              index,
            ) => {
              const nextPoint =
                points[
                  (
                    index +
                    1
                  ) %
                    points.length
                ];

              L.polyline(
                [
                  point,
                  nextPoint,
                ],
                {
                  color:
                    "#000000",

                  weight:
                    3,

                  lineCap:
                    "butt",

                  lineJoin:
                    "bevel",

                  opacity:
                    1,

                  interactive:
                    false,
                },
              ).addTo(
                drawingLayer,
              );
            },
          );
        } else {
          L.polygon(
            points,
            {
              color:
                editingRef.current
                  ? WEB_DRAWING_SELECTED_COLOR
                  : WEB_DRAWING_LINE_COLOR,

              weight:
                editingRef.current
                  ? 3
                  : 2,

              lineCap:
                "round",

              lineJoin:
                "round",

              opacity:
                1,

              fillColor:
                WEB_DRAWING_LINE_COLOR,

              fillOpacity:
                0.075,
            },
          ).addTo(
            drawingLayer,
          );
        }
      }

      points.forEach(
        (
          point,
          index,
        ) => {
          if (
            editingRef.current &&
            polygonFinishedRef.current
          ) {
            const vertexMarker =
              L.marker(
                point,
                {
                  draggable:
                    true,

                  keyboard:
                    false,

                  autoPan:
                    true,

                  icon:
                    L.divIcon({
                      className:
                        "",

                      html:
                        '<span style="display:block;width:18px;height:18px;border:2px solid #B91C1C;border-radius:999px;background:#fee2e2;box-shadow:0 3px 10px rgba(15,23,42,.24);touch-action:none"></span>',

                      iconSize:
                        [18, 18],

                      iconAnchor:
                        [9, 9],
                    }),
                },
              ).addTo(
                drawingLayer,
              );

            vertexMarker.on(
              "dragend",
              () => {
                const nextPoint =
                  vertexMarker.getLatLng();

                pointsRef.current =
                  pointsRef.current.map(
                    (
                      currentPoint,
                      currentIndex,
                    ) =>
                      currentIndex ===
                      index
                        ? [
                            nextPoint.lat,
                            nextPoint.lng,
                          ]
                        : currentPoint,
                  );

                const activeId =
                  activeObjectIdRef.current;

                if (activeId) {
                  patchDrawingObject(
                    activeId,
                    (object) =>
                      object.geometryType ===
                      "polygon"
                        ? createPolygonObject(
                            pointsRef.current,
                            object,
                          )
                        : object,
                  );
                }

                redrawPolygon();
                updateParentPolygon();
              },
            );
          } else {
            L.circleMarker(
              point,
              {
                radius:
                  pdfSnapshotModeRef.current
                    ? 5
                    : 4,

                color:
                  pdfSnapshotModeRef.current
                    ? "#000000"
                    : WEB_DRAWING_LINE_COLOR,

                weight:
                  pdfSnapshotModeRef.current
                    ? 2
                    : 2,

                fillColor:
                  "#ffffff",

                fillOpacity:
                  1,

                interactive:
                  false,
              },
            ).addTo(
              drawingLayer,
            );
          }
        },
      );

      const calculatedArea =
        points.length >=
        3
          ? calculatePolygonArea(
              points,
            )
          : 0;

      setAreaM2(
        calculatedArea,
      );

      const zoom =
        map.getZoom();

      const screenPoints =
        points.map(
          (
            point,
          ) =>
            map.latLngToContainerPoint(
              L.latLng(
                point[0],
                point[1],
              ),
            ),
        );

      const polygonWidth =
        screenPoints.length
          ? Math.max(
              ...screenPoints.map(
                (
                  point,
                ) =>
                  point.x,
              ),
            ) -
            Math.min(
              ...screenPoints.map(
                (
                  point,
                ) =>
                  point.x,
              ),
            )
          : 0;

      const polygonHeight =
        screenPoints.length
          ? Math.max(
              ...screenPoints.map(
                (
                  point,
                ) =>
                  point.y,
              ),
            ) -
            Math.min(
              ...screenPoints.map(
                (
                  point,
                ) =>
                  point.y,
              ),
            )
          : 0;

      if (
        points.length >=
          3 &&
        !(
          activeObject?.geometryType ===
            "polygon" &&
          !drawingRef.current
        )
      ) {
        const centre =
          polygonCentroid(
            points,
          );

        const centrePixel =
          map.latLngToContainerPoint(
            L.latLng(
              centre[0],
              centre[1],
            ),
          );

        const display =
          formatAreaDisplay(
            calculatedArea,
            areaUnitRef.current,
            currentLanguage,
          );
        const escapedAreaText =
          escapeHtml(
            `${display.text} ${display.symbol}`,
          );

        const mode =
          labelMode(
            zoom,
            polygonWidth,
            polygonHeight,
          );

        let html =
          "";

        let width =
          196;

        let height =
          60;

        if (
          mode ===
          "minimal"
        ) {
          width =
            116;

          height =
            30;

          html = `
            <div class="sl-lot-label sl-lot-label-minimal">
              <strong>${escapedAreaText}</strong>
            </div>
          `;
        } else if (
          mode ===
          "compact"
        ) {
          width =
            148;

          height =
            34;

          html = `
            <div class="sl-lot-label sl-lot-label-compact">
              <strong>${escapedAreaText}</strong>
            </div>
          `;
        } else {
          height =
            42;

          html = `
            <div class="sl-lot-label sl-lot-label-full">
              <strong>${escapedAreaText}</strong>
            </div>
          `;
        }

        occupied.push(
          simpleBox(
            centrePixel.x,
            centrePixel.y,
            width,
            height,
          ),
        );

        L.marker(
          centre,
          {
            icon:
              L.divIcon({
                className:
                  "sl-lot-label-icon",

                html,

                iconSize:
                  [1, 1],

                iconAnchor:
                  [0, 0],
              }),

            interactive:
              false,

            keyboard:
              false,
          },
        ).addTo(
          drawingLayer,
        );
      }

      const segmentCount =
        points.length >=
        3
          ? points.length
          : Math.max(
              0,
              points.length -
                1,
            );

      const minimumPixels =
        minimumSegmentPixels(
          zoom,
        );

      points.forEach(
        (point) => {
          const pointPixel =
            map.latLngToContainerPoint(
              L.latLng(
                point[0],
                point[1],
              ),
            );

          occupied.push(
            simpleBox(
              pointPixel.x,
              pointPixel.y,
              32,
              28,
            ),
          );
        },
      );

      for (
        let index = 0;
        index <
        segmentCount;
        index += 1
      ) {
        const start =
          points[
            index
          ];

        const end =
          points.length >=
          3
            ? points[
                (
                  index + 1
                ) %
                  points.length
              ]
            : points[
                index + 1
              ];

        if (
          !start ||
          !end
        ) {
          continue;
        }

        const startPixel =
          map.latLngToContainerPoint(
            L.latLng(
              start[0],
              start[1],
            ),
          );

        const endPixel =
          map.latLngToContainerPoint(
            L.latLng(
              end[0],
              end[1],
            ),
          );

        const dx =
          endPixel.x -
          startPixel.x;

        const dy =
          endPixel.y -
          startPixel.y;

        const pixelLength =
          Math.sqrt(
            dx ** 2 +
            dy ** 2,
          );

        if (
          pixelLength <
          minimumPixels
        ) {
          continue;
        }

        const distanceM =
          calculateDistance(
            start,
            end,
          );

        if (
          distanceM <
          MIN_SEGMENT_METERS
        ) {
          continue;
        }

        let angle =
          radiansToDegrees(
            Math.atan2(
              dy,
              dx,
            ),
          );

        angle =
          readableSegmentAngle(
            angle,
          );

        const midpoint:
          CoordinatePair = [
            (
              start[0] +
              end[0]
            ) / 2,

            (
              start[1] +
              end[1]
            ) / 2,
          ];

        const centreX =
          (
            startPixel.x +
            endPixel.x
          ) / 2;

        const centreY =
          (
            startPixel.y +
            endPixel.y
          ) / 2;

        const normalLength =
          Math.max(
            pixelLength,
            1,
          );

        const normalX =
          -dy /
          normalLength;

        const normalY =
          dx /
          normalLength;

        const bearing =
          bearingToDms(
            calculateBearing(
              start,
              end,
            ),
          );

        const distanceText =
          formatNumber(
            distanceM,
            2,
            currentLanguage,
          );

        const unitText =
          "m";

        const labelWidth =
          Math.max(
            pixelLength < 72
              ? 78
              : 98,
            bearing.length *
              (pixelLength < 72
                ? 6.2
                : 7.2),
            distanceText.length *
              (pixelLength < 72
                ? 6.2
                : 7.2),
          );

        const labelHeight =
          pixelLength <
          72
            ? 12
            : 14;

        const edgeOffset =
          pixelLength < 72
            ? 8
            : 10;

        const centreOffset =
          edgeOffset +
          labelHeight / 2;

        const renderActiveSegmentLabel =
          (
            text: string,
            className: string,
            offsetSign: 1 | -1,
          ) => {
            const labelOffset =
              centreOffset *
              offsetSign;
          const box =
            rotatedBox(
              centreX +
                normalX *
                  labelOffset,

              centreY +
                normalY *
                  labelOffset,

              labelWidth,

              labelHeight,

              angle,
            );

        occupied.push(
          box,
        );

        L.marker(
          midpoint,
          {
            icon:
              L.divIcon({
                className:
                  "sl-survey-label-icon",

                html: `
                  <div
                    class="sl-survey-label ${
                      pixelLength < 100
                        ? "is-compact"
                        : ""
                    } ${
                      pixelLength < 72
                        ? "is-short"
                        : ""
                    }"
                    data-object-id="${escapeHtml(
                      activeObject?.id ??
                        "active-polygon",
                    )}"
                    data-segment-index="${index}"
                    style="
                      --sl-segment-angle:${angle}deg;
                      --sl-label-x:${normalX * labelOffset}px;
                      --sl-label-y:${normalY * labelOffset}px;
                    "
                  >
                    <span class="${className}">
                      ${text}
                    </span>
                  </div>
                `,

                iconSize:
                  [1, 1],

                iconAnchor:
                  [0, 0],
              }),

            interactive:
              false,

            keyboard:
              false,
          },
        ).addTo(
          drawingLayer,
        );
          };

        renderActiveSegmentLabel(
          bearing,
          "sl-survey-bearing",
          -1,
        );

        renderActiveSegmentLabel(
          `${distanceText} ${unitText}`,
          "sl-survey-distance",
          1,
        );
      }

      const showStations =
        (
          pdfSnapshotModeRef.current ||
          zoom >= 15
        ) &&
        points.length >
          0;

      if (
        showStations
      ) {
        const polygonCentre =
          polygonCentroid(
            points,
          );

        const centrePixel =
          map.latLngToContainerPoint(
            L.latLng(
              polygonCentre[0],
              polygonCentre[1],
            ),
          );

        points.forEach(
          (
            point,
            index,
          ) => {
            const pointPixel =
              map.latLngToContainerPoint(
                L.latLng(
                  point[0],
                  point[1],
                ),
              );

            const dx =
              pointPixel.x -
              centrePixel.x;

            const dy =
              pointPixel.y -
              centrePixel.y;

            const length =
              Math.max(
                Math.sqrt(
                  dx ** 2 +
                  dy ** 2,
                ),
                1,
              );

            const outwardX =
              dx /
              length;

            const outwardY =
              dy /
              length;

            const offset =
              pdfSnapshotModeRef.current
                ? 0
                : zoom >= 18
                  ? 24
                  : 20;

            const labelX =
              pointPixel.x +
              outwardX *
                offset;

            const labelY =
              pointPixel.y +
              outwardY *
                offset;

            const box =
              simpleBox(
                labelX,
                labelY,
                30,
                26,
              );

            if (
              !canUseBox(
                box,
                occupied,
              ) &&
              !pdfSnapshotModeRef.current
            ) {
              return;
            }

            occupied.push(
              box,
            );

            if (
              offset !==
              0
            ) {
              const labelPoint =
                map.containerPointToLatLng(
                  L.point(
                    labelX,
                    labelY,
                  ),
                );

              L.polyline(
                [
                  point,
                  [
                    labelPoint.lat,
                    labelPoint.lng,
                  ],
                ],
                {
                  color:
                    "#64748b",
                  weight:
                    1,
                  opacity:
                    0.72,
                  interactive:
                    false,
                },
              ).addTo(
                drawingLayer,
              );
            }

            L.marker(
              point,
              {
                icon:
                  L.divIcon({
                    className:
                      "sl-station-icon",

                    html: `
                      <div
                        class="sl-station-number"
                        style="
                          --sl-station-x:${outwardX * offset}px;
                          --sl-station-y:${outwardY * offset}px;
                        "
                        title="${currentText.station} ${index + 1}"
                      >
                        ${index + 1}
                      </div>
                    `,

                    iconSize:
                      [1, 1],

                    iconAnchor:
                      [0, 0],
                  }),

                interactive:
                  false,

                keyboard:
                  false,
              },
            ).addTo(
              drawingLayer,
            );
          },
        );
      }
    };

  useEffect(
    () => {
      callbackRef.current =
        onPolygonChange;
    },
    [
      onPolygonChange,
    ],
  );

  useEffect(
    () => {
      if (
        previousSavingRef.current &&
        !isSavingLot &&
        !hasUnsavedChanges
      ) {
        setObjectsPanelOpen(false);
      }

      previousSavingRef.current =
        isSavingLot;
    },
    [
      hasUnsavedChanges,
      isSavingLot,
    ],
  );

  useEffect(
    () => {
      drawingObjectsCallbackRef.current =
        onDrawingObjectsChange;
    },
    [
      onDrawingObjectsChange,
    ],
  );

  useEffect(
    () => {
      manualPointsCallbackRef.current =
        onManualPointsChange;
      refreshManualPointState();
    },
    [
      onManualPointsChange,
    ],
  );

  useEffect(
    () => {
      activeObjectCallbackRef.current =
        onActiveObjectChange;
    },
    [
      onActiveObjectChange,
    ],
  );

  useEffect(
    () => {
      if (
        !mapReady ||
        !initialDrawingObjects ||
        drawingObjectsRef.current ===
          initialDrawingObjects
      ) {
        return;
      }

      const nextActiveId =
        initialActiveObjectId &&
        initialDrawingObjects.some(
          (object) =>
            object.id ===
            initialActiveObjectId,
        )
          ? initialActiveObjectId
          : initialDrawingObjects[0]?.id ??
            null;

      publishDrawingObjects(
        initialDrawingObjects,
        nextActiveId,
        {
          markUnsaved: false,
        },
      );
      syncDrawingSequences(
        initialDrawingObjects,
      );
      activeObjectIdRef.current =
        nextActiveId;

      const firstPolygon =
        initialDrawingObjects.find(
          (
            object,
          ): object is PolygonDrawingObject =>
            object.geometryType ===
            "polygon",
        );

      if (firstPolygon) {
        pointsRef.current = [];
        polygonFinishedRef.current =
          true;
        setPointCount(
          0,
        );
        setAreaM2(
          firstPolygon.areaSqm,
        );
      } else {
        pointsRef.current = [];
        polygonFinishedRef.current =
          false;
        setPointCount(
          0,
        );
        setAreaM2(
          0,
        );
      }

      redrawPolygon();
      window.setTimeout(
        updateParentPolygon,
        0,
      );
    },
    [
      initialDrawingObjects,
      initialActiveObjectId,
      mapReady,
    ],
  );

  useEffect(
    () => {
      lotNameRef.current =
        lotName;

      redrawPolygon();
    },
    [
      lotName,
    ],
  );

  useEffect(
    () => {
      if (
        !mapReady ||
        !initialCoordinates ||
        initialCoordinates.length <
          3
      ) {
        return;
      }

      pointsRef.current =
        initialCoordinates.map(
          (
            coordinate,
          ) => [
            coordinate.lat,
            coordinate.lng,
          ],
        );

      if (
        drawingObjectsRef.current.length ===
        0
      ) {
        const loadedPolygon =
          createPolygonObject(
            pointsRef.current,
          );
        publishDrawingObjects(
          [
            loadedPolygon,
          ],
          loadedPolygon.id,
          {
            markUnsaved: false,
          },
        );
        activeObjectIdRef.current =
          loadedPolygon.id;
      }

      drawingRef.current =
        false;

      polygonFinishedRef.current =
        true;

      editingRef.current =
        false;

      redrawPolygon();
      updateParentPolygon();

      const L =
        leafletRef.current;

      const map =
        mapRef.current;

      if (
        L &&
        map
      ) {
        map.fitBounds(
          L.latLngBounds(
            pointsRef.current,
          ),
          {
            padding:
              [48, 48],
          },
        );
      }

      const timeoutId =
        window.setTimeout(
          () => {
            setIsDrawing(
              false,
            );

            setIsEditing(
              false,
            );

            setPointCount(
              pointsRef.current.length,
            );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timeoutId,
        );
      };
    },
    [
      initialCoordinates,
      mapReady,
    ],
  );

  useEffect(
    () => {
      languageRef.current =
        language;

      if (
        drawingRef.current
      ) {
        setMessage(
          MAP_TEXT[
            language
          ].drawingActive,
        );
      } else if (
        polygonFinishedRef.current
      ) {
        setMessage(
          MAP_TEXT[
            language
          ].polygonCompleted,
        );
      } else {
        setMessage(
          MAP_TEXT[
            language
          ].mapReady,
        );
      }

      if (
        !isTracking &&
        locationAccuracy ===
          null
      ) {
        setLocationStatus(
          MAP_TEXT[
            language
          ].locationNotTracked,
        );
      }

      redrawPolygon();

      window.setTimeout(
        updateParentPolygon,
        0,
      );
    },
    [
      language,
    ],
  );

  useEffect(
    () => {
      mapViewChangeRef.current =
        onMapViewChange;
    },
    [
      onMapViewChange,
    ],
  );

  const publishMapView = () => {
    const map =
      mapRef.current;

    if (
      !map ||
      !mapViewChangeRef.current
    ) {
      return;
    }

    const bounds =
      map.getBounds();
    const source =
      getOfflineMapTileSource(
        baseMapRef.current,
      );

    mapViewChangeRef.current({
      bounds: {
        north:
          bounds.getNorth(),
        south:
          bounds.getSouth(),
        east:
          bounds.getEast(),
        west:
          bounds.getWest(),
      },
      zoom:
        map.getZoom(),
      ...source,
    });
  };

  useEffect(
    () => {
      let cancelled =
        false;
      let handleFindCoordinate:
        | ((event: Event) => void)
        | null =
        null;
      let handleClearCoordinateMarker:
        | (() => void)
        | null =
        null;

      async function initialiseMap() {
        if (
          !mapContainerRef.current ||
          mapRef.current
        ) {
          return;
        }

        const module =
          await import(
            "leaflet"
          );

        const L = (
          (
            module as {
              default?:
                typeof import(
                  "leaflet"
                );
            }
          ).default ??
          module
        ) as typeof import(
          "leaflet"
        );

        if (
          cancelled ||
          !mapContainerRef.current
        ) {
          return;
        }

        leafletRef.current =
          L;

        const map =
          L.map(
            mapContainerRef.current,
            {
              center:
                DEFAULT_CENTRE,

              zoom:
                DEFAULT_ZOOM,

              zoomControl:
                false,

              doubleClickZoom:
                true,

              attributionControl:
                true,
            },
          );

        const baseLayer =
          createBaseLayer(
            L,
            baseMapRef.current,
          );

        baseLayer.addTo(
          map,
        );

        baseLayerRef.current =
          baseLayer;

        L.control
          .scale({
            metric:
              true,

            imperial:
              false,

            position:
              "bottomleft",
          })
          .addTo(
            map,
          );

        const drawingLayer =
          L.layerGroup().addTo(
            map,
          );

        const dashedLineLayer =
          L.layerGroup().addTo(
            map,
          );

        const manualPointLayer =
          L.layerGroup().addTo(
            map,
          );

        const locationLayer =
          L.layerGroup().addTo(
            map,
          );

        const coordinateMarkerLayer =
          L.layerGroup().addTo(
            map,
          );

        mapRef.current =
          map;

        drawingLayerRef.current =
          drawingLayer;

        dashedLineLayerRef.current =
          dashedLineLayer;

        manualPointLayerRef.current =
          manualPointLayer;

        locationLayerRef.current =
          locationLayer;

        coordinateMarkerLayerRef.current =
          coordinateMarkerLayer;

        handleFindCoordinate = (
          event: Event,
        ) => {
          const detail =
            (
              event as CustomEvent<{
                latitude?: number;
                longitude?: number;
                label?: string;
              }>
            ).detail;

          if (
            typeof detail?.latitude !==
              "number" ||
            typeof detail.longitude !==
              "number"
          ) {
            return;
          }

          coordinateMarkerLayer.clearLayers();
          const marker =
            L.marker([
              detail.latitude,
              detail.longitude,
            ]).bindPopup(
              `<strong>${escapeHtml(detail.label ?? "Keyed coordinate")}</strong><br/>WGS84 preliminary approximate field reference only`,
            );

          marker.addTo(
            coordinateMarkerLayer,
          );
          map.setView(
            [
              detail.latitude,
              detail.longitude,
            ],
            Math.max(
              map.getZoom(),
              17,
            ),
          );
          marker.openPopup();
        };

        handleClearCoordinateMarker =
          () => {
            coordinateMarkerLayer.clearLayers();
          };

        window.addEventListener(
          "sabahlot:find-coordinate",
          handleFindCoordinate,
        );
        window.addEventListener(
          "sabahlot:clear-coordinate-marker",
          handleClearCoordinateMarker,
        );

        const handleClick = (
          event:
            import(
              "leaflet"
            ).LeafletMouseEvent,
        ) => {
          if (
            activeFieldToolRef.current ===
            "add_point"
          ) {
            const newPoint:
              ManualFieldPoint = {
                id:
                  createFieldPointId(),
                pointCode:
                  nextManualPointCode(),
                pointName:
                  "",
                category:
                  manualPointCategory,
                notes:
                  "",
                coordinate: [
                  event.latlng.lat,
                  event.latlng.lng,
                ],
                isVisible: true,
                createdAt:
                  new Date().toISOString(),
              };

            manualPointsRef.current = [
              ...manualPointsRef.current,
              newPoint,
            ];
            setSelectedManualPointId(
              newPoint.id,
            );
            refreshManualPointState();
            setMessage(
              `${newPoint.pointCode} added.`,
            );
            window.setTimeout(
              redrawManualPoints,
              0,
            );
            return;
          }

          if (
            activeFieldToolRef.current ===
              "line" ||
            activeFieldToolRef.current ===
              "dashed_line"
          ) {
            const newPoint:
              CoordinatePair = [
                event.latlng.lat,
                event.latlng.lng,
              ];
            const previous =
              pointsRef.current[
                pointsRef.current
                  .length - 1
              ];

            if (
              previous
            ) {
              const previousPixel =
                map.latLngToContainerPoint(
                  L.latLng(
                    previous[0],
                    previous[1],
                  ),
                );
              const newPixel =
                map.latLngToContainerPoint(
                  event.latlng,
                );

              if (
                calculateDistance(
                  previous,
                  newPoint,
                ) <
                  MIN_SEGMENT_METERS ||
                previousPixel.distanceTo(
                  newPixel,
                ) <
                  MIN_CLICK_PIXELS
              ) {
                setMessage(
                  MAP_TEXT[
                    languageRef.current
                  ].pointTooClose,
                );
                return;
              }
            }

            pointsRef.current = [
              ...pointsRef.current,
              newPoint,
            ];
            setPointCount(
              pointsRef.current
                .length,
            );
            setDashedDraftCount(
              pointsRef.current
                .length,
            );
            setMessage(
              `${pointsRef.current.length} line points recorded.`,
            );
            redrawPolygon();
            return;
          }

          if (
            !drawingRef.current
          ) {
            return;
          }

          const newPoint:
            CoordinatePair = [
              event.latlng.lat,
              event.latlng.lng,
            ];

          const previous =
            pointsRef.current[
              pointsRef.current
                .length - 1
            ];

          if (
            previous
          ) {
            const previousPixel =
              map.latLngToContainerPoint(
                L.latLng(
                  previous[0],
                  previous[1],
                ),
              );

            const newPixel =
              map.latLngToContainerPoint(
                event.latlng,
              );

            if (
              calculateDistance(
                previous,
                newPoint,
              ) <
                MIN_SEGMENT_METERS ||

              previousPixel.distanceTo(
                newPixel,
              ) <
                MIN_CLICK_PIXELS
            ) {
              setMessage(
                MAP_TEXT[
                  languageRef.current
                ].pointTooClose,
              );

              return;
            }
          }

          pointsRef.current = [
            ...pointsRef.current,
            newPoint,
          ];

          setPointCount(
            pointsRef.current
              .length,
          );

          setMessage(
            MAP_TEXT[
              languageRef.current
            ].pointsRecorded(
              pointsRef.current
                .length,
            ),
          );

          redrawPolygon();
        };

        map.on(
          "click",
          handleClick,
        );

        map.on(
          "zoomend",
          redrawPolygon,
        );
        map.on(
          "zoomend",
          redrawDashedLines,
        );
        map.on(
          "zoomend",
          redrawManualPoints,
        );
        map.on(
          "zoomend",
          publishMapView,
        );

        map.on(
          "moveend",
          redrawPolygon,
        );
        map.on(
          "moveend",
          redrawDashedLines,
        );
        map.on(
          "moveend",
          redrawManualPoints,
        );
        map.on(
          "moveend",
          publishMapView,
        );

        window.setTimeout(
          () =>
            map.invalidateSize(),

          200,
        );

        setMapReady(
          true,
        );
        publishMapView();
      }

      void initialiseMap();

      return () => {
        cancelled =
          true;

        if (
          locationWatchRef.current !==
            null &&

          typeof navigator !==
            "undefined" &&

          navigator.geolocation
        ) {
          navigator.geolocation.clearWatch(
            locationWatchRef.current,
          );

          locationWatchRef.current =
            null;
        }

        mapRef.current?.remove();

        if (handleFindCoordinate) {
          window.removeEventListener(
            "sabahlot:find-coordinate",
            handleFindCoordinate,
          );
        }

        if (handleClearCoordinateMarker) {
          window.removeEventListener(
            "sabahlot:clear-coordinate-marker",
            handleClearCoordinateMarker,
          );
        }

        mapRef.current =
          null;

        leafletRef.current =
          null;

        baseLayerRef.current =
          null;

        drawingLayerRef.current =
          null;

        dashedLineLayerRef.current =
          null;

        manualPointLayerRef.current =
          null;

        locationLayerRef.current =
          null;

        coordinateMarkerLayerRef.current =
          null;
      };
    },
    [],
  );

  const beginDrawing =
    (
      tool:
        | "polygon"
        | "line"
        | "dashed_line",
    ) => {
      if (
        !mapReady
      ) {
        return;
      }

      if (
        drawingRef.current
      ) {
        setMessage(
          "Complete the current drawing first.",
        );
        return;
      }

      pointsRef.current =
        [];

      dashedDraftRef.current =
        [];

      activeObjectIdRef.current =
        null;
      setActiveObjectId(
        null,
      );
      activeObjectCallbackRef.current?.(
        null,
      );
      drawingRef.current =
        true;

      polygonFinishedRef.current =
        false;

      editingRef.current =
        false;

      draftLineStyleRef.current =
        tool === "dashed_line"
          ? "dashed"
          : "solid";

      setActiveTool(tool);

      drawingLayerRef.current?.clearLayers();

      mapRef.current?.doubleClickZoom.disable();

      setIsDrawing(
        true,
      );

      setIsEditing(
        false,
      );

      setPointCount(
        0,
      );

      setDashedDraftCount(
        0,
      );

      setAreaM2(
        0,
      );

      setMessage(
        tool === "polygon"
          ? MAP_TEXT[
              languageRef.current
            ].drawingActive
          : "Line drawing active. Click or tap each point.",
      );

      setDrawMenuOpen(false);
      setAddMoreMenuOpen(false);
      setEditMenuOpen(false);
      setExportMenuOpen(false);
      redrawPolygon();
    };

  const startDrawing =
    () =>
      beginDrawing(
        "polygon",
      );

  const startLineDrawing =
    () =>
      beginDrawing(
        "line",
      );

  const startDashedLineDrawing =
    () =>
      beginDrawing(
        "dashed_line",
      );

  const toggleAddMoreMenu =
    () => {
      if (
        drawingRef.current
      ) {
        setMessage(
          "Complete the current drawing first.",
        );
        return;
      }

      setAddMoreMenuOpen(
        (current) =>
          !current,
      );
      setDrawMenuOpen(
        false,
      );
    };

  const undoLastPoint =
    () => {
      if (
        activeFieldToolRef.current ===
          "line" ||
        activeFieldToolRef.current ===
          "dashed_line"
      ) {
        if (
          pointsRef.current
            .length === 0
        ) {
          return;
        }

        pointsRef.current =
          pointsRef.current.slice(
            0,
            -1,
          );
        setPointCount(
          pointsRef.current
            .length,
        );
        setDashedDraftCount(
          pointsRef.current
            .length,
        );
        setMessage(
          pointsRef.current
            .length === 0
            ? "Line draft cleared."
            : `${pointsRef.current.length} line points remaining.`,
        );
        redrawPolygon();
        return;
      }

      if (
        !drawingRef.current ||

        pointsRef.current
          .length === 0
      ) {
        return;
      }

      pointsRef.current =
        pointsRef.current.slice(
          0,
          -1,
        );

      setPointCount(
        pointsRef.current.length,
      );

      setMessage(
        pointsRef.current
          .length === 0
          ? MAP_TEXT[
              languageRef.current
            ].allPointsRemoved
          : MAP_TEXT[
              languageRef.current
            ].lastPointRemoved(
              pointsRef.current
                .length,
            ),
      );

      redrawPolygon();

      callbackRef.current(
        null,
      );
    };

  const finishPolygon =
    () => {
      const points =
        sanitizePoints(
          pointsRef.current,
        );

      if (
        points.length <
        3
      ) {
        window.alert(
          MAP_TEXT[
            languageRef.current
          ].polygonMinimum,
        );

        return;
      }

      pointsRef.current =
        points;

      const nextPolygon =
        createPolygonObject(
          points,
        );
      publishDrawingObjects(
        [
          ...drawingObjectsRef.current,
          nextPolygon,
        ],
        nextPolygon.id,
      );
      activeObjectIdRef.current =
        nextPolygon.id;
      pointsRef.current =
        [];
      dashedDraftRef.current =
        [];

      drawingRef.current =
        false;

      polygonFinishedRef.current =
        true;

      editingRef.current =
        false;

      setActiveTool(
        null,
      );

      mapRef.current?.doubleClickZoom.enable();

      setIsDrawing(
        false,
      );

      setIsEditing(
        false,
      );

      setPointCount(
        0,
      );
      setDashedDraftCount(
        0,
      );
      setAreaM2(
        nextPolygon.areaSqm,
      );

      redrawPolygon();

      updateParentPolygon();

      fitPolygon();

      setMessage(
        MAP_TEXT[
          languageRef.current
        ].polygonCompleted,
      );
    };

  const clearPolygon =
    () => {
      pointsRef.current =
        [];

      drawingRef.current =
        false;

      polygonFinishedRef.current =
        false;

      editingRef.current =
        false;

      setActiveTool(
        null,
      );

      drawingLayerRef.current?.clearLayers();

      mapRef.current?.doubleClickZoom.enable();

      setIsDrawing(
        false,
      );

      setIsEditing(
        false,
      );

      setPointCount(
        0,
      );

      setAreaM2(
        0,
      );

      setMessage(
        MAP_TEXT[
          languageRef.current
        ].polygonDeleted,
      );

      callbackRef.current(
        null,
      );
    };

  const toggleDashedLineTool =
    () => {
      if (
        !mapReady
      ) {
        return;
      }

      if (
        activeFieldToolRef.current ===
          "dashed_line" &&
        drawingRef.current
      ) {
        pointsRef.current =
          [];
        dashedDraftRef.current =
          [];
        setPointCount(
          0,
        );
        setDashedDraftCount(
          0,
        );
        setActiveTool(
          null,
        );
        drawingRef.current =
          false;
        mapRef.current?.doubleClickZoom.enable();
        setMessage(
          "Dashed line tool closed.",
        );
        redrawPolygon();
        return;
      }

      beginDrawing(
        "dashed_line",
      );
    };

  const toggleAddPointTool =
    () => {
      if (
        !mapReady
      ) {
        return;
      }

      if (
        activeFieldToolRef.current ===
        "add_point"
      ) {
        setActiveTool(
          null,
        );
        mapRef.current?.doubleClickZoom.enable();
        setMessage(
          "Add Point tool closed.",
        );
        redrawManualPoints();
        return;
      }

      drawingRef.current =
        false;
      editingRef.current =
        false;
      dashedDraftRef.current =
        [];
      setDashedDraftCount(
        0,
      );
      setIsDrawing(
        false,
      );
      setIsEditing(
        false,
      );
      setActiveTool(
        "add_point",
      );
      mapRef.current?.doubleClickZoom.disable();
      setMessage(
        "Add Point active. Click the map to add P1, P2, P3...",
      );
      redrawPolygon();
      redrawDashedLines();
      redrawManualPoints();
    };

  const finishDashedLine =
    () => {
      if (
        pointsRef.current.length <
        2
      ) {
        window.alert(
          "At least two points are required.",
        );
        return;
      }

      const lineStyle =
        activeFieldToolRef.current ===
        "dashed_line"
          ? "dashed"
          : "solid";
      const nextLine =
        createLineObject(
          sanitizePoints(
            pointsRef.current,
          ),
          lineStyle,
          lineStyle === "dashed"
            ? dashedLineCategory
            : "standard_line",
        );

      publishDrawingObjects(
        [
          ...drawingObjectsRef.current,
          nextLine,
        ],
        nextLine.id,
      );
      activeObjectIdRef.current =
        nextLine.id;
      pointsRef.current =
        [];
      dashedDraftRef.current =
        [];
      setDashedDraftCount(
        0,
      );
      setPointCount(
        0,
      );
      setActiveTool(
        null,
      );
      drawingRef.current =
        false;
      polygonFinishedRef.current =
        false;
      setIsDrawing(
        false,
      );
      setIsEditing(
        false,
      );
      setDrawMenuOpen(
        false,
      );
      setAddMoreMenuOpen(
        false,
      );
      mapRef.current?.doubleClickZoom.enable();
      setMessage(
        "Line completed.",
      );
      redrawPolygon();
    };

  const clearDashedLine =
    () => {
      if (
        drawingRef.current &&
        (
          activeFieldToolRef.current ===
            "line" ||
          activeFieldToolRef.current ===
            "dashed_line"
        ) &&
        pointsRef.current.length >
        0
      ) {
        pointsRef.current =
          [];
        dashedDraftRef.current =
          [];
        setPointCount(
          0,
        );
        setDashedDraftCount(
          0,
        );
        setMessage(
          "Line draft cleared.",
        );
        redrawPolygon();
        return;
      }

      if (
        !activeObjectIdRef.current
      ) {
        return;
      }

      const activeId =
        activeObjectIdRef.current;
      const activeObject =
        drawingObjectsRef.current.find(
          (object) =>
            object.id === activeId,
        );

      if (
        activeObject?.geometryType !==
        "line"
      ) {
        return;
      }

      const nextObjects =
        drawingObjectsRef.current.filter(
          (object) =>
            object.id !== activeId,
        );
      const nextActive =
        nextObjects[0]?.id ?? null;
      publishDrawingObjects(
        nextObjects,
        nextActive,
      );
      pointsRef.current =
        nextActive
          ? coordinatesToPairs(
              nextObjects[0].coordinates,
            )
          : [];
      setPointCount(
        pointsRef.current.length,
      );
      setMessage(
        `${activeObject.name} deleted.`,
      );
      redrawPolygon();
      updateParentPolygon();
    };

  const deleteActiveObject =
    () => {
      if (
        drawingRef.current
      ) {
        if (
          activeFieldToolRef.current ===
            "line" ||
          activeFieldToolRef.current ===
            "dashed_line"
        ) {
          clearDashedLine();
          return;
        }

        clearPolygon();
        return;
      }

      const activeId =
        activeObjectIdRef.current;

      if (!activeId) {
        return;
      }

      const activeObject =
        drawingObjectsRef.current.find(
          (object) =>
            object.id === activeId,
        );

      if (!activeObject) {
        return;
      }

      const nextObjects =
        drawingObjectsRef.current.filter(
          (object) =>
            object.id !== activeId,
        );
      const nextActive =
        nextObjects[0]?.id ?? null;

      publishDrawingObjects(
        nextObjects,
        nextActive,
      );
      pointsRef.current =
        nextActive
          ? coordinatesToPairs(
              nextObjects[0].coordinates,
            )
          : [];
      polygonFinishedRef.current =
        nextObjects[0]?.geometryType ===
        "polygon";
      editingRef.current =
        false;
      setIsEditing(false);
      setPointCount(
        pointsRef.current.length,
      );
      setAreaM2(
        nextObjects[0]?.geometryType ===
          "polygon"
          ? nextObjects[0].areaSqm
          : 0,
      );
      setMessage(
        `${activeObject.name} deleted.`,
      );
      redrawPolygon();
      updateParentPolygon();
    };

  const finishAddPoint =
    () => {
      setActiveTool(
        null,
      );
      mapRef.current?.doubleClickZoom.enable();
      setMessage(
        "Add Point completed.",
      );
      redrawManualPoints();
    };

  const clearSelectedManualPoint =
    () => {
      const selectedId =
        selectedManualPointId ??
        manualPointsRef.current[
          manualPointsRef.current
            .length - 1
        ]?.id;

      if (
        selectedId
      ) {
        deleteManualPoint(
          selectedId,
        );
      }
    };

  const toggleEditing =
    () => {
      if (
        !activeObjectIdRef.current
      ) {
        return;
      }

      const activeObject =
        drawingObjectsRef.current.find(
          (object) =>
            object.id ===
            activeObjectIdRef.current,
        );

      if (
        !editingRef.current &&
        activeObject
      ) {
        pointsRef.current =
          coordinatesToPairs(
            activeObject.coordinates,
          );
        polygonFinishedRef.current =
          activeObject.geometryType ===
          "polygon";
        setPointCount(
          pointsRef.current.length,
        );
        setAreaM2(
          activeObject.geometryType ===
            "polygon"
            ? activeObject.areaSqm
            : 0,
        );
      }

      editingRef.current =
        !editingRef.current;

      setIsEditing(
        editingRef.current,
      );

      redrawPolygon();
    };

  const fitPolygon =
    () => {
      const L =
        leafletRef.current;

      const map =
        mapRef.current;

      const activeObject =
        activeObjectIdRef.current
          ? drawingObjectsRef.current.find(
              (object) =>
                object.id ===
                activeObjectIdRef.current,
            ) ?? null
          : null;

      const points =
        sanitizePoints(
          pointsRef.current.length > 0
            ? pointsRef.current
            : activeObject
              ? coordinatesToPairs(
                  activeObject.coordinates,
                )
              : [],
        );

      if (
        !L ||
        !map ||
        points.length ===
          0
      ) {
        return;
      }

      if (
        points.length ===
        1
      ) {
        map.flyTo(
          points[0],
          18,
          {
            duration:
              0.8,
          },
        );

        return;
      }

      map.fitBounds(
        L.latLngBounds(
          points,
        ),
        {
          paddingTopLeft:
            [100, 100],

          paddingBottomRight:
            [360, 110],

          maxZoom:
            19,
        },
      );
    };

  useEffect(() => {
    const preparePdfSnapshot = (
      event: Event,
    ) => {
      const L =
        leafletRef.current;
      const map =
        mapRef.current;
      const currentPoints =
        sanitizePoints(
          pointsRef.current.length > 0
            ? pointsRef.current
            : activeObjectIdRef.current
              ? coordinatesToPairs(
                  drawingObjectsRef.current.find(
                    (object) =>
                      object.id ===
                      activeObjectIdRef.current,
                  )?.coordinates ?? [],
                )
              : [],
        );
      const visibleObjectPoints =
        sanitizePoints(
          drawingObjectsRef.current
            .filter(
              (object) =>
                object.isVisible &&
                object.coordinates.length >
                  0,
            )
            .flatMap(
              (object) =>
                coordinatesToPairs(
                  object.coordinates,
                ),
            ),
        );
      const points =
        visibleObjectPoints.length >= 2
          ? visibleObjectPoints
          : currentPoints;

      if (
        !L ||
        !map ||
        points.length <
          2
      ) {
        (
          event as CustomEvent<{
            onReady?: () => void;
          }>
        ).detail?.onReady?.();
        return;
      }

        const eventDetail =
          (
            event as CustomEvent<{
              paddingRatio?: number;
              paddingX?: number;
              paddingY?: number;
              restore?: boolean;
              overviewZoom?: number;
              overviewOnly?: boolean;
              baseOnly?: boolean;
              onReady?: () => void;
            }>
          ).detail;
      const paddingRatio =
        eventDetail?.paddingRatio ??
        0.18;
      const waitForTiles = (
        timeoutMs = 1800,
      ) =>
        new Promise<void>(
          (resolve) => {
            const tileLayers:
              TileLayer[] = [];

            map.eachLayer(
              (layer) => {
                if (
                  layer instanceof
                  L.TileLayer
                ) {
                  tileLayers.push(
                    layer,
                  );
                }
              },
            );

            if (
              tileLayers.length ===
              0
            ) {
              window.setTimeout(
                resolve,
                120,
              );
              return;
            }

            let resolved =
              false;
            const cleanup = () => {
              tileLayers.forEach(
                (layer) => {
                  layer.off(
                    "load",
                    checkReady,
                  );
                  layer.off(
                    "tileerror",
                    checkReady,
                  );
                },
              );
            };
            const finish = () => {
              if (resolved) {
                return;
              }

              resolved =
                true;
              cleanup();
              resolve();
            };
            const checkReady = () => {
              const stillLoading =
                tileLayers.some(
                  (layer) => {
                    const maybeLayer =
                      layer as TileLayer & {
                        isLoading?: () => boolean;
                      };

                    return maybeLayer.isLoading?.() ??
                      false;
                  },
                );

              if (!stillLoading) {
                window.setTimeout(
                  finish,
                  120,
                );
              }
            };

            tileLayers.forEach(
              (layer) => {
                layer.on(
                  "load",
                  checkReady,
                );
                layer.on(
                  "tileerror",
                  checkReady,
                );
              },
            );

            window.setTimeout(
              finish,
              timeoutMs,
            );
            checkReady();
          },
        );

      if (
        eventDetail?.restore
      ) {
        const originalView =
          pdfSnapshotViewRef.current;

        pdfSnapshotModeRef.current =
          false;
        pdfSnapshotOverviewOnlyRef.current =
          false;

        if (originalView) {
          map.setView(
            originalView.centre,
            originalView.zoom,
            {
              animate:
                false,
            },
          );
        }

        redrawPolygon();
        redrawDashedLines();
        redrawManualPoints();
        pdfSnapshotViewRef.current =
          null;
        eventDetail.onReady?.();
        return;
      }

      if (
        !pdfSnapshotViewRef.current
      ) {
        const centre =
          map.getCenter();

        pdfSnapshotViewRef.current = {
          centre:
            [
              centre.lat,
              centre.lng,
            ],
          zoom:
            map.getZoom(),
        };
      }

      pdfSnapshotModeRef.current =
        true;
      pdfSnapshotOverviewOnlyRef.current =
        Boolean(
          eventDetail?.overviewOnly ||
            eventDetail?.baseOnly,
        );

      if (
        eventDetail?.overviewZoom
      ) {
        const centre =
          L.latLngBounds(
            points,
          ).getCenter();
        let settled =
          false;
        const finish = () => {
          if (settled) {
            return;
          }

          settled =
            true;
          redrawPolygon();
          redrawDashedLines();
          redrawManualPoints();
          void waitForTiles().then(
            () => {
              window.setTimeout(
                () => {
                  eventDetail.onReady?.();
                },
                250,
              );
            },
          );
        };

        map.once(
          "moveend",
          finish,
        );
        map.setView(
          centre,
          eventDetail.overviewZoom,
          {
            animate:
              false,
          },
        );
        window.setTimeout(
          finish,
          120,
        );
        return;
      }

      const padding =
        Math.round(
          Math.min(
            map.getSize().x,
            map.getSize().y,
          ) *
            paddingRatio,
        );
      const paddingX =
        Math.max(
          20,
          Math.min(
            eventDetail?.paddingX ??
              padding,
            map.getSize().x *
              0.45,
          ),
        );
      const paddingY =
        Math.max(
          20,
          Math.min(
            eventDetail?.paddingY ??
              padding,
            map.getSize().y *
              0.45,
          ),
        );

      let settled =
        false;
      const finish = () => {
        if (settled) {
          return;
        }

        settled =
          true;
        redrawPolygon();
        redrawDashedLines();
        redrawManualPoints();

        void waitForTiles().then(
          () => {
            window.setTimeout(
              () => {
                eventDetail?.onReady?.();
              },
              250,
            );
          },
        );
      };

      map.once(
        "moveend",
        finish,
      );

      map.fitBounds(
        L.latLngBounds(
          points,
        ),
        {
          animate:
            false,
          padding:
            [
              paddingX,
              paddingY,
            ],
          maxZoom:
            19,
        },
      );

      window.setTimeout(
        finish,
        120,
      );
    };

    const getPdfOverlayGeometry = (
      event: Event,
    ) => {
      const L =
        leafletRef.current;
      const map =
        mapRef.current;
      const currentPoints =
        sanitizePoints(
          pointsRef.current,
        );
      const visibleObjects =
        drawingObjectsRef.current.filter(
          (object) =>
            object.isVisible &&
            object.coordinates.length >=
              (
                object.geometryType ===
                "polygon"
                  ? 3
                  : 2
              ),
        );
      const eventDetail =
        (
          event as CustomEvent<{
            onReady?: (
              geometry:
                | PdfOverlayGeometry
                | null,
            ) => void;
          }>
        ).detail;

      if (
        !L ||
        !map
      ) {
        eventDetail?.onReady?.(null);
        return;
      }

      const toOverlayPoint = (
        point: CoordinatePair,
      ): PdfOverlayPoint => {
        const containerPoint =
          map.latLngToContainerPoint(
            L.latLng(
              point[0],
              point[1],
            ),
          );

        return {
          x: containerPoint.x,
          y: containerPoint.y,
          lat: point[0],
          lng: point[1],
        };
      };

      const vertices =
        (
          visibleObjects.length > 0
            ? visibleObjects.flatMap(
                (object) =>
                  coordinatesToPairs(
                    object.coordinates,
                  ),
              )
            : currentPoints
        ).map(toOverlayPoint);

      const segments =
        (
          visibleObjects.length > 0
            ? visibleObjects.flatMap(
                (object) => {
                  const objectPoints =
                    coordinatesToPairs(
                      object.coordinates,
                    );
                  const objectVertices =
                    objectPoints.map(
                      toOverlayPoint,
                    );
                  const segmentLimit =
                    object.geometryType ===
                    "polygon"
                      ? objectPoints.length
                      : objectPoints.length -
                        1;

                  return objectPoints
                    .slice(
                      0,
                      segmentLimit,
                    )
                    .map(
                      (
                        start,
                        index,
                      ) => {
                        const nextIndex =
                          object.geometryType ===
                          "polygon"
                            ? (
                                index + 1
                              ) %
                              objectPoints.length
                            : index + 1;
                        const end =
                          objectPoints[nextIndex];
                        const startVertex =
                          objectVertices[index];
                        const endVertex =
                          objectVertices[nextIndex];

                        return {
                          start,
                          end,
                          startVertex,
                          endVertex,
                        };
                      },
                    );
                },
              )
            : currentPoints.map(
                (
                  start,
                  index,
                ) => {
                  const nextIndex =
                    (
                      index + 1
                    ) %
                    currentPoints.length;

                  return {
                    start,
                    end:
                      currentPoints[nextIndex],
                    startVertex:
                      vertices[index],
                    endVertex:
                      vertices[nextIndex],
                  };
                },
              )
        )
          .filter(
            (detail) =>
              Boolean(
                detail.end &&
                  detail.startVertex &&
                  detail.endVertex,
              ),
          )
          .map(
          (
            detail,
          ): PdfOverlaySegment => {
            const {
              start,
              end,
              startVertex,
              endVertex,
            } = detail;
            const dx =
              endVertex.x -
              startVertex.x;
            const dy =
              endVertex.y -
              startVertex.y;
            let angle =
              radiansToDegrees(
                Math.atan2(
                  dy,
                  dx,
                ),
              );

            if (
              angle > 90 ||
              angle < -90
            ) {
              angle += 180;
            }

            const distanceM =
              calculateDistance(
                start,
                end,
              );

            return {
              start:
                startVertex,
              end:
                endVertex,
              midpoint: {
                x:
                  (
                    startVertex.x +
                    endVertex.x
                  ) / 2,
                y:
                  (
                    startVertex.y +
                    endVertex.y
                  ) / 2,
              },
              angle,
              distanceText:
                formatNumber(
                  distanceM,
                  2,
                  languageRef.current,
                ),
              unitText:
                "m",
              bearing:
                bearingToDms(
                  calculateBearing(
                    start,
                    end,
                  ),
                ),
            };
          },
        );

      const size =
        map.getSize();

      eventDetail?.onReady?.({
        width:
          size.x,
        height:
          size.y,
        vertices,
        segments,
      });
    };

    window.addEventListener(
      "sabahlot:prepare-pdf-snapshot",
      preparePdfSnapshot,
    );
    window.addEventListener(
      "sabahlot:get-pdf-overlay-geometry",
      getPdfOverlayGeometry,
    );

    return () => {
      window.removeEventListener(
        "sabahlot:prepare-pdf-snapshot",
        preparePdfSnapshot,
      );
      window.removeEventListener(
        "sabahlot:get-pdf-overlay-geometry",
        getPdfOverlayGeometry,
      );
    };
  }, []);

  const resetToSabah =
    () => {
      mapRef.current?.flyTo(
        DEFAULT_CENTRE,
        DEFAULT_ZOOM,
        {
          duration:
            0.9,
        },
      );
    };

  const handleBaseMapChange = (
    event:
      ChangeEvent<HTMLSelectElement>,
  ) => {
    const selected =
      event.target
        .value as BaseMapId;

    const L =
      leafletRef.current;

    const map =
      mapRef.current;

    baseMapRef.current =
      selected;

    setBaseMap(
      selected,
    );

    if (
      L &&
      map
    ) {
      if (
        baseLayerRef.current
      ) {
        map.removeLayer(
          baseLayerRef.current,
        );
      }

      const nextLayer =
        createBaseLayer(
          L,
          selected,
        );

      nextLayer.addTo(
        map,
      );

      baseLayerRef.current =
        nextLayer;
    }

    window.setTimeout(
      updateParentPolygon,
      0,
    );
    window.setTimeout(
      publishMapView,
      0,
    );
  };

  const handleDistanceUnitChange = (
    event:
      ChangeEvent<HTMLSelectElement>,
  ) => {
    const selected =
      event.target
        .value as DistanceUnit;

    distanceUnitRef.current =
      selected;

    setDistanceUnit(
      selected,
    );

    redrawPolygon();

    window.setTimeout(
      updateParentPolygon,
      0,
    );
  };

  const handleAreaUnitChange = (
    event:
      ChangeEvent<HTMLSelectElement>,
  ) => {
    const selected =
      event.target
        .value as AreaUnit;

    areaUnitRef.current =
      selected;

    setAreaUnit(
      selected,
    );

    onAreaUnitChange?.(
      selected,
    );

    redrawPolygon();

    window.setTimeout(
      updateParentPolygon,
      0,
    );
  };

  const stopLocationTracking =
    () => {
      if (
        locationWatchRef.current !==
          null &&

        navigator.geolocation
      ) {
        navigator.geolocation.clearWatch(
          locationWatchRef.current,
        );

        locationWatchRef.current =
          null;
      }

      setIsTracking(
        false,
      );

      setLocationStatus(
        MAP_TEXT[
          languageRef.current
        ].trackingStopped,
      );
    };

  const startLocationTracking =
    () => {
      if (
        typeof navigator ===
          "undefined" ||

        !navigator.geolocation
      ) {
        setLocationStatus(
          MAP_TEXT[
            languageRef.current
          ].locationUnsupported,
        );

        return;
      }

      const L =
        leafletRef.current;

      const map =
        mapRef.current;

      const locationLayer =
        locationLayerRef.current;

      if (
        !L ||
        !map ||
        !locationLayer
      ) {
        return;
      }

      locationCentredRef.current =
        false;

      setIsTracking(
        true,
      );

      setLocationStatus(
        MAP_TEXT[
          languageRef.current
        ].locating,
      );

      locationWatchRef.current =
        navigator.geolocation.watchPosition(
          (
            position,
          ) => {
            const latitude =
              position.coords
                .latitude;

            const longitude =
              position.coords
                .longitude;

            const accuracy =
              position.coords
                .accuracy;

            const location:
              CoordinatePair = [
                latitude,
                longitude,
              ];

            const activeText =
              MAP_TEXT[
                languageRef.current
              ];

            locationLayer.clearLayers();

            L.circle(
              location,
              {
                radius:
                  accuracy,

                color:
                  "#2563eb",

                weight:
                  2,

                opacity:
                  0.72,

                fillColor:
                  "#60a5fa",

                fillOpacity:
                  0.16,

                interactive:
                  false,
              },
            ).addTo(
              locationLayer,
            );

            L.marker(
              location,
              {
                icon:
                  L.divIcon({
                    className:
                      "sl-current-location-icon",

                    html:
                      '<div class="sl-current-location-marker"><span></span></div>',

                    iconSize:
                      [26, 26],

                    iconAnchor:
                      [13, 13],
                  }),
              },
            )
              .bindPopup(
                `
                  <strong>
                    ${activeText.currentLocation}
                  </strong>

                  <br />

                  ${activeText.latitude}:
                  ${latitude.toFixed(7)}

                  <br />

                  ${activeText.longitude}:
                  ${longitude.toFixed(7)}

                  <br />

                  ${activeText.accuracy}:
                  ±${accuracy.toFixed(1)} m
                `,
              )
              .addTo(
                locationLayer,
              );

            setLocationAccuracy(
              accuracy,
            );

            setLocationStatus(
              activeText.locationSuccess(
                accuracy,
              ),
            );

            if (
              !locationCentredRef.current
            ) {
              map.flyTo(
                location,

                Math.max(
                  map.getZoom(),
                  18,
                ),

                {
                  duration:
                    1,
                },
              );

              locationCentredRef.current =
                true;
            }
          },

          (
            error,
          ) => {
            if (
              locationWatchRef.current !==
              null
            ) {
              navigator.geolocation.clearWatch(
                locationWatchRef.current,
              );

              locationWatchRef.current =
                null;
            }

            setIsTracking(
              false,
            );

            setLocationAccuracy(
              null,
            );

            setLocationStatus(
              locationErrorMessage(
                error,
                languageRef.current,
              ),
            );
          },

          {
            enableHighAccuracy:
              true,

            timeout:
              20000,

            maximumAge:
              2000,
          },
        );
    };

  const toggleLocationTracking =
    () => {
      if (
        isTracking
      ) {
        stopLocationTracking();
      } else {
        startLocationTracking();
      }
    };

  const performSearch =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      const query =
        searchValue.trim();

      if (
        !query
      ) {
        setSearchMessage(
          text.searchEmpty,
        );

        return;
      }

      const map =
        mapRef.current;

      if (
        !map
      ) {
        return;
      }

      const coordinates =
        parseCoordinates(
          query,
        );

      if (
        coordinates
      ) {
        map.flyTo(
          coordinates,
          18,
          {
            duration:
              1,
          },
        );

        setSearchMessage(
          `${coordinates[0].toFixed(6)}, ` +
            `${coordinates[1].toFixed(6)}`,
        );

        return;
      }

      setSearchBusy(
        true,
      );

      setSearchMessage(
        text.searching,
      );

      try {
        const response =
          await fetch(
            "https://nominatim.openstreetmap.org/search" +
              "?format=json" +
              "&limit=1" +
              "&countrycodes=my" +
              `&q=${encodeURIComponent(query)}`,
            {
              headers: {
                "Accept-Language":
                  language ===
                  "en"
                    ? "en"
                    : "ms",
              },
            },
          );

        if (
          !response.ok
        ) {
          throw new Error(
            "Search request failed",
          );
        }

        const results =
          await response.json() as
            NominatimResult[];

        const result =
          results[0];

        if (
          !result
        ) {
          setSearchMessage(
            text.searchNotFound,
          );

          return;
        }

        const location:
          CoordinatePair = [
            Number(
              result.lat,
            ),

            Number(
              result.lon,
            ),
          ];

        map.flyTo(
          location,
          17,
          {
            duration:
              1,
          },
        );

        setSearchMessage(
          result.display_name,
        );
      } catch {
        setSearchMessage(
          text.searchFailed,
        );
      } finally {
        setSearchBusy(
          false,
        );
      }
    };

  const changeLanguage = (
    nextLanguage:
      AppLanguage,
  ) => {
    if (
      onLanguageChange
    ) {
      onLanguageChange(
        nextLanguage,
      );
    }
  };

  const currentArea =
    formatAreaDisplay(
      areaM2,
      areaUnit,
      language,
    );

  const activeObjectForUi =
    activeObjectId
      ? drawingObjects.find(
          (object) =>
            object.id ===
            activeObjectId,
        )
      : null;
  const canFitActiveGeometry =
    pointCount > 0 ||
    Boolean(
      activeObjectForUi
        ?.coordinates.length,
    );
  const isDashedLineMode =
    activeFieldTool ===
    "dashed_line";
  const isLineMode =
    activeFieldTool ===
    "line";
  const isAddPointMode =
    activeFieldTool ===
    "add_point";
  const canUndo =
    isDashedLineMode ||
    isLineMode
      ? pointCount > 0
      : isAddPointMode
        ? false
      : isDrawing &&
        pointCount > 0;
  const canComplete =
    isDashedLineMode ||
    isLineMode
      ? isDrawing &&
        pointCount >= 2
      : isAddPointMode
        ? true
      : isDrawing &&
        pointCount >= 3;
  const canDelete =
    isDashedLineMode ||
    isLineMode
      ? (
          isDrawing &&
          pointCount > 0
        ) ||
        Boolean(
          activeObjectId,
        )
      : isAddPointMode
        ? manualPointCount > 0
      : Boolean(
          activeObjectId,
        ) ||
        (
          isDrawing &&
          pointCount > 0
        );
  const handleComplete =
    isDashedLineMode ||
    isLineMode
      ? finishDashedLine
      : isAddPointMode
        ? finishAddPoint
      : finishPolygon;
  const handleDelete =
    isDashedLineMode ||
    isLineMode
      ? clearDashedLine
      : isAddPointMode
        ? clearSelectedManualPoint
      : deleteActiveObject;
  const cancelActiveDrawing =
    () => {
      if (isAddPointMode) {
        toggleAddPointTool();
        return;
      }

      if (
        isDashedLineMode ||
        isLineMode
      ) {
        clearDashedLine();
        setActiveTool(null);
        drawingRef.current = false;
        setIsDrawing(false);
        mapRef.current?.doubleClickZoom.enable();
        redrawPolygon();
        return;
      }

      clearPolygon();
    };
  const selectedManualPoint =
    manualPointsRef.current.find(
      (point) =>
        point.id ===
        selectedManualPointId,
    ) ?? null;

  const summaryPolygon =
    getPrimaryPolygon();
  const summaryPerimeterM =
    summaryPolygon?.perimeterM ??
    (
      pointCount >= 3 &&
      pointsRef.current.length >= 3
        ? calculateLineLength([
            ...pointsRef.current,
            pointsRef.current[0],
          ])
        : 0
    );
  const isDrawingCursorActive =
    isDrawing ||
    activeFieldTool !== null;

  return (
    <div
      className={`sl-map-shell ${
        isDrawingCursorActive
          ? "is-drawing-tool-active sabahlot-drawing-cursor"
          : ""
      }`}
    >
      <div
        ref={mapContainerRef}
        className="sl-map-canvas"
        aria-label="SabahLot powered by Myukur interactive preliminary map"
      />

      <header className="sl-topbar">
        <button
          type="button"
          className="sl-icon-button sl-menu-button"
          onClick={onOpenLotPanel}
          title={text.openLot}
          aria-label={text.openLot}
        >
          <Icon>
            <path d="M4 7h16M4 12h16M4 17h16" />
          </Icon>
        </button>

        <div className="sl-brand-chip">
          <span className="sl-brand-mark">
            SL
          </span>
          <span>
            <strong>SabahLot</strong>
            <small>powered by Myukur</small>
          </span>
        </div>

        <form
          className="sl-search"
          onSubmit={performSearch}
        >
          <input
            type="text"
            value={searchValue}
            onChange={(
              event:
                ChangeEvent<HTMLInputElement>,
            ) =>
              setSearchValue(
                event.target.value,
              )
            }
            placeholder={
              text.searchPlaceholder
            }
            aria-label={
              text.searchPlaceholder
            }
          />

          <button
            type="submit"
            disabled={searchBusy}
            aria-label={text.search}
            title={text.search}
          >
            {searchBusy
              ? (
                <span className="sl-spinner" />
              )
              : (
                <Icon>
                  <circle
                    cx="11"
                    cy="11"
                    r="7"
                  />

                  <path d="m20 20-3.7-3.7" />
                </Icon>
              )}
          </button>

          {searchMessage && (
            <span className="sl-search-message">
              {searchMessage}
            </span>
          )}
        </form>

        <div className="sl-topbar-actions">
          <button
            type="button"
            className={
              `sl-icon-button ${
                settingsOpen
                  ? "is-active"
                  : ""
              }`
            }
            onClick={() =>
              setSettingsOpen(
                (
                  current,
                ) =>
                  !current,
              )
            }
            title={text.settings}
            aria-label={text.settings}
          >
            <Icon>
              <circle
                cx="12"
                cy="12"
                r="3"
              />

              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.14.35.35.66.6.9.29.27.67.42 1.07.42H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
            </Icon>
          </button>
        </div>
      </header>

      {isDrawing || isAddPointMode ? (
        <nav
          className="sl-context-toolbar"
          aria-label="Drawing actions"
        >
          <button
            type="button"
            className="sl-context-button"
            onClick={cancelActiveDrawing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sl-context-button"
            onClick={undoLastPoint}
            disabled={!canUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="sl-context-button is-primary"
            onClick={handleComplete}
            disabled={!canComplete}
          >
            Done
          </button>
        </nav>
      ) : (
        <nav
          className="sl-tool-dock"
          aria-label="Drawing tools"
        >
          <button
            type="button"
            className={`sl-dock-button sl-tool-button ${drawMenuOpen ? "is-active" : ""}`}
            onClick={() => {
              setDrawMenuOpen((current) => !current);
              setEditMenuOpen(false);
              setExportMenuOpen(false);
            }}
            disabled={!mapReady}
          >
            <Icon>
              <path d="M4 20h4l10.8-10.8a2.8 2.8 0 0 0-4-4L4 16v4Z" />
              <path d="m13.5 6.5 4 4" />
            </Icon>
            <span>Draw</span>
          </button>

          <button
            type="button"
            className={`sl-dock-button sl-tool-button ${editMenuOpen ? "is-active" : ""}`}
            onClick={() => {
              setEditMenuOpen((current) => !current);
              setDrawMenuOpen(false);
              setExportMenuOpen(false);
            }}
            disabled={!activeObjectId}
          >
            <Icon>
              <circle cx="6" cy="18" r="1.5" />
              <circle cx="18" cy="6" r="1.5" />
              <path d="m7.2 16.8 8.1-8.1" />
              <path d="M13 18h5M18 13v5" />
            </Icon>
            <span>Edit</span>
          </button>

          <button
            type="button"
            className={`sl-dock-button sl-tool-button is-save ${hasUnsavedChanges ? "is-unsaved" : ""}`}
            onClick={onSaveLot}
            disabled={isSavingLot}
          >
            <Icon>
              <path d="M5 4h12l2 2v14H5V4Z" />
              <path d="M8 4v6h8V4M8 20v-6h8v6" />
            </Icon>
            <span>Save</span>
          </button>

          <button
            type="button"
            className={`sl-dock-button sl-tool-button ${exportMenuOpen ? "is-active" : ""}`}
            onClick={() => {
              setExportMenuOpen((current) => !current);
              setDrawMenuOpen(false);
              setEditMenuOpen(false);
            }}
            disabled={!mapReady}
          >
            <Icon>
              <path d="M7 3h7l4 4v14H7V3Z" />
              <path d="M14 3v5h5" />
              <path d="M9 13h6M9 17h4" />
            </Icon>
            <span>Export</span>
          </button>
        </nav>
      )}

      {drawMenuOpen && !isDrawing && !isAddPointMode && (
        <aside className="sl-progressive-menu sl-tool-flyout sl-draw-menu">
          <strong>Draw</strong>
          <button type="button" onClick={startDrawing}>
            Draw Polygon
          </button>
          <button type="button" onClick={startDrawing}>
            Add Polygon
          </button>
          <button type="button" onClick={startLineDrawing}>
            Add Line
          </button>
          <button type="button" onClick={startDashedLineDrawing}>
            Add Dashed Line
          </button>
          <button type="button" onClick={toggleAddPointTool}>
            Add Point
          </button>
        </aside>
      )}

      {editMenuOpen && !isDrawing && !isAddPointMode && (
        <aside className="sl-progressive-menu sl-tool-flyout sl-edit-menu">
          <strong>Edit</strong>
          <button
            type="button"
            onClick={toggleEditing}
            disabled={!activeObjectId}
          >
            {isEditing ? text.finishEditing : "Edit"}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!canDelete}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={() => {
              if (!activeObjectId) {
                return;
              }
              patchDrawingObject(
                activeObjectId,
                (object) => ({
                  ...object,
                  isVisible: !object.isVisible,
                  updatedAt: new Date().toISOString(),
                }),
              );
              redrawPolygon();
            }}
            disabled={!activeObjectId}
          >
            Hide / Show
          </button>
        </aside>
      )}

      {exportMenuOpen && !isDrawing && !isAddPointMode && (
        <aside className="sl-progressive-menu sl-tool-flyout sl-export-menu">
          <strong>Export</strong>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={!onExportPdf || isExportingPdf}
          >
            PDF
          </button>
          <button
            type="button"
            onClick={onExportKml}
            disabled={!onExportKml}
          >
            KML
          </button>
          <button
            type="button"
            onClick={onExportDxf}
            disabled={!onExportDxf}
          >
            DXF
          </button>
        </aside>
      )}

      {objectsPanelOpen ? (
      <aside className="sl-object-list">
        <div className="sl-object-list-heading">
          <strong>
            Objects
          </strong>
          <span>
            {drawingObjects.length}
          </span>
          <button
            type="button"
            onClick={() =>
              setObjectsPanelOpen(false)
            }
            aria-label="Close Objects"
          >
            ×
          </button>
        </div>

        {drawingObjects.length === 0 ? (
          <small>
            No objects yet
          </small>
        ) : (
          drawingObjects.map(
            (object) => (
              <article
                key={object.id}
                className={
                  `sl-object-row ${
                    object.id ===
                    activeObjectId
                      ? "is-active"
                      : ""
                  }`
                }
              >
                <button
                  type="button"
                  className="sl-object-main"
                  onClick={() =>
                    selectDrawingObject(
                      object.id,
                    )
                  }
                  disabled={isDrawing}
                >
                  <strong>
                    {object.name}
                  </strong>
                  <span>
                    {object.geometryType ===
                    "polygon"
                      ? `Polygon · ${formatNumber(
                          object.areaSqm,
                          2,
                          language,
                        )} m²`
                      : `Line · ${formatNumber(
                          object.lengthM,
                          2,
                          language,
                        )} m`}
                  </span>
                </button>

                {object.geometryType ===
                  "polygon" && (
                  <label
                    style={{
                      display: "grid",
                      gap: 3,
                      gridColumn:
                        "1 / -1",
                    }}
                  >
                    <span
                      style={{
                        color: "#64748b",
                        fontSize: 9,
                        fontWeight: 800,
                      }}
                    >
                      Rename
                    </span>
                    <input
                      key={`${object.id}-${object.name}`}
                      type="text"
                      defaultValue={
                        object.name
                      }
                      maxLength={60}
                      disabled={isDrawing}
                      aria-label={`Rename ${object.name}`}
                      onBlur={(event) =>
                        renamePolygonObject(
                          object.id,
                          event.target.value,
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          "Enter"
                        ) {
                          event.currentTarget.blur();
                        }
                      }}
                      style={{
                        minHeight: 34,
                        minWidth: 0,
                        padding: "0 8px",
                        color: "#0f172a",
                        background: "#ffffff",
                        border:
                          "1px solid #cbd5e1",
                        borderRadius: 7,
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    />
                  </label>
                )}

                <button
                  type="button"
                  onClick={() => {
                    patchDrawingObject(
                      object.id,
                      (currentObject) => ({
                        ...currentObject,
                        isVisible:
                          !currentObject.isVisible,
                        updatedAt:
                          new Date().toISOString(),
                      }),
                    );
                    redrawPolygon();
                  }}
                  title={
                    object.isVisible
                      ? "Hide"
                      : "Show"
                  }
                  aria-label={
                    object.isVisible
                      ? "Hide"
                      : "Show"
                  }
                >
                  {object.isVisible
                    ? "Hide"
                    : "Show"}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    selectDrawingObject(
                      object.id,
                    );
                    window.setTimeout(
                      () => {
                        editingRef.current =
                          true;
                        setIsEditing(true);
                        redrawPolygon();
                      },
                      0,
                    );
                  }}
                  disabled={isDrawing}
                >
                  Edit
                </button>

                <button
                  type="button"
                  className="is-danger"
                  onClick={() => {
                    selectDrawingObject(
                      object.id,
                    );
                    window.setTimeout(
                      deleteActiveObject,
                      0,
                    );
                  }}
                  disabled={isDrawing}
                >
                  Delete
                </button>
              </article>
            ),
          )
        )}
      </aside>
      ) : (
        <button
          type="button"
          className="sl-object-list-tab"
          onClick={() =>
            setObjectsPanelOpen(true)
          }
          aria-label="Open Objects"
        >
          Objects ({drawingObjects.length})
        </button>
      )}

      {isDashedLineMode && (
        <aside className="sl-dashed-line-options">
          <label>
            <span>
              Dashed line
            </span>

            <select
              value={dashedLineCategory}
              onChange={(event) => {
                setDashedLineCategory(
                  event.target
                    .value as DashedLineCategory,
                );
                window.setTimeout(
                  redrawPolygon,
                  0,
                );
              }}
            >
              {DASHED_LINE_CATEGORIES.map(
                (category) => (
                  <option
                    key={category.value}
                    value={category.value}
                  >
                    {category.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <small>
            {dashedDraftCount} draft points · {dashedLineCount} lines
          </small>
        </aside>
      )}

      {isAddPointMode && (
        <aside className="sl-field-point-options">
          <label>
            <span>
              New point category
            </span>

            <select
              value={manualPointCategory}
              onChange={(event) =>
                setManualPointCategory(
                  event.target
                    .value as FieldPointCategory,
                )
              }
            >
              {FIELD_POINT_CATEGORIES.map(
                (category) => (
                  <option
                    key={category.value}
                    value={category.value}
                  >
                    {category.label}
                  </option>
                ),
              )}
            </select>
          </label>

          <small>
            {manualPointCount} manual points
          </small>

          {selectedManualPoint && (
            <div className="sl-field-point-editor">
              <strong>
                {selectedManualPoint.pointCode}
              </strong>

              <label>
                <span>
                  Name
                </span>
                <input
                  type="text"
                  value={
                    selectedManualPoint.pointName
                  }
                  onChange={(event) =>
                    updateManualPoint(
                      selectedManualPoint.id,
                      {
                        pointName:
                          event.target.value,
                      },
                    )
                  }
                  placeholder="Optional"
                />
              </label>

              <label>
                <span>
                  Category
                </span>
                <select
                  value={
                    selectedManualPoint.category
                  }
                  onChange={(event) =>
                    updateManualPoint(
                      selectedManualPoint.id,
                      {
                        category:
                          event.target
                            .value as FieldPointCategory,
                      },
                    )
                  }
                >
                  {FIELD_POINT_CATEGORIES.map(
                    (category) => (
                      <option
                        key={category.value}
                        value={category.value}
                      >
                        {category.label}
                      </option>
                    ),
                  )}
                </select>
              </label>

              <label>
                <span>
                  Notes
                </span>
                <textarea
                  value={
                    selectedManualPoint.notes
                  }
                  onChange={(event) =>
                    updateManualPoint(
                      selectedManualPoint.id,
                      {
                        notes:
                          event.target.value,
                      },
                    )
                  }
                  placeholder="Optional"
                  rows={3}
                />
              </label>

              <button
                type="button"
                onClick={() =>
                  updateManualPoint(
                    selectedManualPoint.id,
                    {
                      isVisible:
                        !selectedManualPoint.isVisible,
                    },
                  )
                }
              >
                {selectedManualPoint.isVisible
                  ? "Hide point"
                  : "Show point"}
              </button>

              <button
                type="button"
                onClick={() =>
                  deleteManualPoint(
                    selectedManualPoint.id,
                  )
                }
              >
                Delete point
              </button>
            </div>
          )}
        </aside>
      )}

      {pointCount >= 3 && (
        <section
          className="sl-floating-summary-card"
          aria-label="Lot summary"
        >
          <span>
            <small>Estimated Area</small>
            <strong>{currentArea.text}</strong>
          </span>
          <span>
            <small>Points</small>
            <strong>{pointCount}</strong>
          </span>
          <span>
            <small>Perimeter</small>
            <strong>
              {formatNumber(
                summaryPerimeterM,
                2,
                language,
              )}{" "}
              m
            </strong>
          </span>
        </section>
      )}

      {settingsOpen && (
        <aside className="sl-settings-card">
          <div className="sl-settings-heading">
            <div>
              <span className="sl-eyebrow">
                SabahLot powered by Myukur
              </span>

              <h2>
                {text.mapDisplay}
              </h2>

              <p>
                {text.settingsDescription}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setSettingsOpen(
                  false,
                )
              }
              aria-label="Close settings"
            >
              ×
            </button>
          </div>

          <label className="sl-setting-field">
            <span>
              {text.baseMap}
            </span>

            <select
              value={baseMap}
              onChange={
                handleBaseMapChange
              }
              disabled={!mapReady}
            >
              {BASE_MAPS.map(
                (
                  definition,
                ) => (
                  <option
                    key={
                      definition.id
                    }
                    value={
                      definition.id
                    }
                  >
                    {getBaseMapName(
                      definition,
                      language,
                    )}
                  </option>
                ),
              )}
            </select>
          </label>

          <div className="sl-settings-grid">
            <label className="sl-setting-field">
              <span>
                {text.distanceUnit}
              </span>

              <select
                value={
                  distanceUnit
                }
                onChange={
                  handleDistanceUnitChange
                }
              >
                <option value="m">
                  {text.meter}
                </option>

                <option value="ft">
                  {text.feet}
                </option>

                <option value="link">
                  {text.link}
                </option>

                <option value="chain">
                  {text.chain}
                </option>
              </select>
            </label>

            <label className="sl-setting-field">
              <span>
                {text.areaUnit}
              </span>

              <select
                value={
                  areaUnit
                }
                onChange={
                  handleAreaUnitChange
                }
              >
                <option value="m2">
                  {text.squareMetres}
                </option>

                <option value="ft2">
                  {text.squareFeet}
                </option>

                <option value="ha">
                  {text.hectares}
                </option>

                <option value="acre">
                  {text.acres}
                </option>
              </select>
            </label>
          </div>

          <div className="sl-current-display">
            <span>
              {getBaseMapName(
                getBaseMap(
                  baseMap,
                ),
                language,
              )}
            </span>

            <strong>
              {distanceSymbol(
                distanceUnit,
                language,
              )}
              {" · "}
              {currentArea.symbol}
            </strong>
          </div>
        </aside>
      )}

      <nav
        className="sl-map-navigation"
        aria-label="Map navigation"
      >
        <button
          type="button"
          onClick={() =>
            mapRef.current?.zoomIn()
          }
          title={text.zoomIn}
          aria-label={text.zoomIn}
        >
          <Icon>
            <path d="M12 5v14M5 12h14" />
          </Icon>
        </button>

        <button
          type="button"
          onClick={() =>
            mapRef.current?.zoomOut()
          }
          title={text.zoomOut}
          aria-label={text.zoomOut}
        >
          <Icon>
            <path d="M5 12h14" />
          </Icon>
        </button>

        <button
          type="button"
          onClick={fitPolygon}
          disabled={
            !canFitActiveGeometry
          }
          title={
            text.fitPolygon
          }
          aria-label={
            text.fitPolygon
          }
        >
          <Icon>
            <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
          </Icon>
        </button>

        <button
          type="button"
          onClick={resetToSabah}
          title={
            text.resetSabah
          }
          aria-label={
            text.resetSabah
          }
        >
          <Icon>
            <path d="M3 11 12 3l9 8" />
            <path d="M5 10v10h14V10" />
          </Icon>
        </button>
      </nav>

      <div className="sl-map-status">
        <span
          className={
            `sl-status-dot ${
              isDrawing ||
              isTracking
                ? "is-active"
                : ""
            }`
          }
        />

        <span className="sl-status-message">
          {message}
        </span>

        <span className="sl-status-divider" />

        <strong>
          {pointCount}{" "}
          {text.points}
        </strong>

        <span className="sl-status-divider sl-status-location-divider" />

        <span className="sl-location-status">
          {locationStatus}
        </span>

        {locationAccuracy !==
          null && (
          <strong className="sl-location-accuracy">
            ±
            {formatNumber(
              locationAccuracy,
              1,
              language,
            )}{" "}
            m
          </strong>
        )}
      </div>

    </div>
    );
}
