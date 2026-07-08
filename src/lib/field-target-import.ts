import {
  createFieldGpsId,
} from "@/lib/field-gps";

export interface ImportedTargetPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface FieldTargetImportResult {
  points: ImportedTargetPoint[];
  importedCount: number;
  skippedCount: number;
  warning?: string;
}

const UNSUPPORTED_COORDINATE_SYSTEM_MESSAGE =
  "Unsupported coordinate system for this phase. Please use WGS84 latitude/longitude.";

const DXF_UNCONFIRMED_COORDINATE_SYSTEM_MESSAGE =
  "DXF coordinate system is not confirmed. Please ensure coordinates are WGS84 latitude/longitude or convert before field use.";

const CSV_NAME_HEADERS = [
  "name",
  "point_name",
  "point name",
  "id",
];

const CSV_LATITUDE_HEADERS = [
  "latitude",
  "lat",
  "y",
];

const CSV_LONGITUDE_HEADERS = [
  "longitude",
  "lng",
  "x",
];

const CSV_EASTING_NORTHING_HEADERS = [
  "easting",
  "northing",
];

function isValidLatitude(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90
  );
}

function isValidLongitude(
  value: number,
): boolean {
  return (
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180
  );
}

function padVertexIndex(
  index: number,
): string {
  return String(index).padStart(3, "0");
}

function normalizeCsvHeader(
  value: string,
): string {
  return value.trim().toLowerCase();
}

function splitCsvLine(
  line: string,
): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (
    let index = 0;
    index < line.length;
    index += 1
  ) {
    const char = line[index];

    if (inQuotes) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells;
}

export function parseCsvTargets(
  text: string,
): FieldTargetImportResult {
  const lines = text
    .split(/\r\n|\r|\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      points: [],
      importedCount: 0,
      skippedCount: 0,
      warning: "CSV file is empty.",
    };
  }

  const headerCells = splitCsvLine(
    lines[0],
  ).map(normalizeCsvHeader);
  const nameIndex = headerCells.findIndex(
    (header) => CSV_NAME_HEADERS.includes(header),
  );
  const latitudeIndex = headerCells.findIndex(
    (header) => CSV_LATITUDE_HEADERS.includes(header),
  );
  const longitudeIndex = headerCells.findIndex(
    (header) => CSV_LONGITUDE_HEADERS.includes(header),
  );

  const dataRows = lines.slice(1);

  if (latitudeIndex === -1 || longitudeIndex === -1) {
    const hasEastingNorthing = headerCells.some(
      (header) => CSV_EASTING_NORTHING_HEADERS.includes(header),
    );

    return {
      points: [],
      importedCount: 0,
      skippedCount: dataRows.length,
      warning: hasEastingNorthing
        ? UNSUPPORTED_COORDINATE_SYSTEM_MESSAGE
        : "CSV header not recognized. Expected columns for name, latitude and longitude.",
    };
  }

  const points: ImportedTargetPoint[] = [];
  let skippedCount = 0;

  dataRows.forEach((line, rowIndex) => {
    const cells = splitCsvLine(line);
    const latitude = Number(
      cells[latitudeIndex]?.trim(),
    );
    const longitude = Number(
      cells[longitudeIndex]?.trim(),
    );

    if (
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      skippedCount += 1;
      return;
    }

    const rawName =
      nameIndex !== -1
        ? cells[nameIndex]?.trim()
        : "";

    points.push({
      id: createFieldGpsId(),
      name: rawName || `Point ${rowIndex + 1}`,
      latitude,
      longitude,
    });
  });

  return {
    points,
    importedCount: points.length,
    skippedCount,
  };
}

function parseKmlCoordinateToken(
  token: string,
): { latitude: number; longitude: number } | null {
  const parts = token.trim().split(",");

  if (parts.length < 2) {
    return null;
  }

  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);

  if (
    !isValidLatitude(latitude) ||
    !isValidLongitude(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
  };
}

function parseKmlCoordinatesText(
  text: string,
): Array<{ latitude: number; longitude: number } | null> {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map(parseKmlCoordinateToken);
}

export function parseKmlTargets(
  text: string,
): FieldTargetImportResult {
  if (typeof DOMParser === "undefined") {
    return {
      points: [],
      importedCount: 0,
      skippedCount: 0,
      warning: "KML import is only supported in the browser.",
    };
  }

  const xml = new DOMParser().parseFromString(
    text,
    "text/xml",
  );

  if (xml.getElementsByTagName("parsererror").length > 0) {
    return {
      points: [],
      importedCount: 0,
      skippedCount: 0,
      warning: "Unable to parse KML file.",
    };
  }

  const placemarks = Array.from(
    xml.getElementsByTagName("Placemark"),
  );
  const points: ImportedTargetPoint[] = [];
  let skippedCount = 0;

  placemarks.forEach((placemark) => {
    const nameElement =
      placemark.getElementsByTagName("name")[0];
    const placemarkName =
      nameElement?.textContent?.trim() ||
      "Placemark";

    const pointCoordinatesElement = placemark
      .getElementsByTagName("Point")[0]
      ?.getElementsByTagName("coordinates")[0];

    if (pointCoordinatesElement) {
      const [coordinate] = parseKmlCoordinatesText(
        pointCoordinatesElement.textContent ?? "",
      );

      if (coordinate) {
        points.push({
          id: createFieldGpsId(),
          name: placemarkName,
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
        });
      } else {
        skippedCount += 1;
      }

      return;
    }

    const ringCoordinatesElement = placemark
      .getElementsByTagName("outerBoundaryIs")[0]
      ?.getElementsByTagName("LinearRing")[0]
      ?.getElementsByTagName("coordinates")[0];

    if (ringCoordinatesElement) {
      const parsedVertices = parseKmlCoordinatesText(
        ringCoordinatesElement.textContent ?? "",
      );
      const validVertices = parsedVertices.filter(
        (
          vertex,
        ): vertex is {
          latitude: number;
          longitude: number;
        } => vertex !== null,
      );

      skippedCount +=
        parsedVertices.length -
        validVertices.length;

      const isClosedRing =
        validVertices.length > 1 &&
        validVertices[0].latitude ===
          validVertices[validVertices.length - 1]
            .latitude &&
        validVertices[0].longitude ===
          validVertices[validVertices.length - 1]
            .longitude;

      const uniqueVertices = isClosedRing
        ? validVertices.slice(0, -1)
        : validVertices;

      uniqueVertices.forEach((vertex, index) => {
        points.push({
          id: createFieldGpsId(),
          name: `${placemarkName} V${padVertexIndex(index + 1)}`,
          latitude: vertex.latitude,
          longitude: vertex.longitude,
        });
      });

      return;
    }

    skippedCount += 1;
  });

  return {
    points,
    importedCount: points.length,
    skippedCount,
  };
}

interface DxfGroup {
  code: number;
  value: string;
}

function parseDxfGroups(
  text: string,
): DxfGroup[] {
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const groups: DxfGroup[] = [];

  for (
    let index = 0;
    index + 1 < lines.length;
    index += 2
  ) {
    const code = Number(lines[index]);

    if (!Number.isFinite(code)) {
      continue;
    }

    groups.push({
      code,
      value: lines[index + 1],
    });
  }

  return groups;
}

export function parseDxfTargets(
  text: string,
): FieldTargetImportResult {
  const groups = parseDxfGroups(text);

  if (groups.length === 0) {
    return {
      points: [],
      importedCount: 0,
      skippedCount: 0,
      warning: "Unable to read DXF file.",
    };
  }

  const points: ImportedTargetPoint[] = [];
  let skippedCount = 0;
  let outOfRangeSkip = false;

  const pushVertex = (
    label: string,
    x: number | undefined,
    y: number | undefined,
  ) => {
    if (x === undefined || y === undefined) {
      return;
    }

    const longitude = x;
    const latitude = y;

    if (
      !isValidLatitude(latitude) ||
      !isValidLongitude(longitude)
    ) {
      skippedCount += 1;
      outOfRangeSkip = true;
      return;
    }

    points.push({
      id: createFieldGpsId(),
      name: label,
      latitude,
      longitude,
    });
  };

  let index = 0;
  let pointCounter = 0;
  let polylineCounter = 0;
  let currentPolylineLayer: string | null = null;
  let currentPolylineVertexIndex = 0;
  let insidePolylineEntity = false;

  while (index < groups.length) {
    const group = groups[index];

    if (group.code !== 0) {
      index += 1;
      continue;
    }

    const entityType = group.value.toUpperCase();

    if (entityType === "POINT") {
      let x: number | undefined;
      let y: number | undefined;
      index += 1;

      while (
        index < groups.length &&
        groups[index].code !== 0
      ) {
        if (groups[index].code === 10) {
          x = Number(groups[index].value);
        }

        if (groups[index].code === 20) {
          y = Number(groups[index].value);
        }

        index += 1;
      }

      pointCounter += 1;
      pushVertex(
        `DXF Point ${pointCounter}`,
        x,
        y,
      );
      continue;
    }

    if (entityType === "LWPOLYLINE") {
      let layer: string | undefined;
      const vertices: Array<{
        x?: number;
        y?: number;
      }> = [];
      let currentX: number | undefined;
      let currentY: number | undefined;
      index += 1;

      while (
        index < groups.length &&
        groups[index].code !== 0
      ) {
        const entryGroup = groups[index];

        if (entryGroup.code === 8) {
          layer = entryGroup.value;
        }

        if (entryGroup.code === 10) {
          if (currentX !== undefined) {
            vertices.push({
              x: currentX,
              y: currentY,
            });
          }

          currentX = Number(entryGroup.value);
          currentY = undefined;
        }

        if (entryGroup.code === 20) {
          currentY = Number(entryGroup.value);
        }

        index += 1;
      }

      if (currentX !== undefined) {
        vertices.push({
          x: currentX,
          y: currentY,
        });
      }

      polylineCounter += 1;
      const label =
        layer || `LWPOLYLINE ${polylineCounter}`;

      vertices.forEach((vertex, vertexIndex) => {
        pushVertex(
          `${label} V${padVertexIndex(vertexIndex + 1)}`,
          vertex.x,
          vertex.y,
        );
      });

      continue;
    }

    if (entityType === "POLYLINE") {
      polylineCounter += 1;
      currentPolylineLayer = null;
      currentPolylineVertexIndex = 0;
      insidePolylineEntity = true;
      index += 1;

      while (
        index < groups.length &&
        groups[index].code !== 0
      ) {
        if (groups[index].code === 8) {
          currentPolylineLayer =
            groups[index].value;
        }

        index += 1;
      }

      continue;
    }

    if (entityType === "VERTEX" && insidePolylineEntity) {
      let x: number | undefined;
      let y: number | undefined;
      index += 1;

      while (
        index < groups.length &&
        groups[index].code !== 0
      ) {
        if (groups[index].code === 10) {
          x = Number(groups[index].value);
        }

        if (groups[index].code === 20) {
          y = Number(groups[index].value);
        }

        index += 1;
      }

      currentPolylineVertexIndex += 1;
      const label =
        currentPolylineLayer ||
        `POLYLINE ${polylineCounter}`;
      pushVertex(
        `${label} V${padVertexIndex(currentPolylineVertexIndex)}`,
        x,
        y,
      );
      continue;
    }

    if (entityType === "SEQEND") {
      insidePolylineEntity = false;
      index += 1;
      continue;
    }

    index += 1;
  }

  return {
    points,
    importedCount: points.length,
    skippedCount,
    warning: outOfRangeSkip
      ? DXF_UNCONFIRMED_COORDINATE_SYSTEM_MESSAGE
      : undefined,
  };
}

export function parseFieldTargetFile(
  fileName: string,
  text: string,
): FieldTargetImportResult {
  const extension =
    fileName.split(".").pop()?.toLowerCase() ?? "";

  if (extension === "csv") {
    return parseCsvTargets(text);
  }

  if (extension === "kml") {
    return parseKmlTargets(text);
  }

  if (extension === "dxf") {
    return parseDxfTargets(text);
  }

  return {
    points: [],
    importedCount: 0,
    skippedCount: 0,
    warning:
      "Unsupported file type. Please import a .csv, .kml, or .dxf file.",
  };
}
