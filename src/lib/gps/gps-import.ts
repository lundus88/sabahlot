import type {
  GpsPoint,
  GpsTrack,
  ParsedGpsFile,
} from "./gps-types";

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function parseGpsFile(file: File): Promise<ParsedGpsFile> {
  const text = await file.text();
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "gpx") return parseGpx(text);
  if (extension === "kml") return parseKml(text);
  if (extension === "csv") return parseCsv(text);

  throw new Error("Format tidak disokong. Sila guna .GPX, .KML atau .CSV.");
}

function parseGpx(xmlText: string): ParsedGpsFile {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  const waypoints: GpsPoint[] = [];
  const tracks: GpsTrack[] = [];

  doc.querySelectorAll("wpt").forEach((node, index) => {
    const lat = Number(node.getAttribute("lat"));
    const lng = Number(node.getAttribute("lon"));
    const name =
      node.querySelector("name")?.textContent ??
      `Waypoint ${index + 1}`;

    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      waypoints.push({
        id: createId("gpx-wpt"),
        name,
        lat,
        lng,
        source: "GPX",
        type: "waypoint",
      });
    }
  });

  doc.querySelectorAll("trk").forEach((trackNode, trackIndex) => {
    const points: GpsPoint[] = [];

    trackNode.querySelectorAll("trkpt").forEach((pointNode, pointIndex) => {
      const lat = Number(pointNode.getAttribute("lat"));
      const lng = Number(pointNode.getAttribute("lon"));

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        points.push({
          id: createId("gpx-trkpt"),
          name: `Track ${trackIndex + 1} Point ${pointIndex + 1}`,
          lat,
          lng,
          source: "GPX",
          type: "trackpoint",
        });
      }
    });

    if (points.length > 0) {
      tracks.push({
        id: createId("gpx-track"),
        name:
          trackNode.querySelector("name")?.textContent ??
          `Track ${trackIndex + 1}`,
        points,
        source: "GPX",
      });
    }
  });

  return {
    waypoints,
    tracks,
    warnings: [],
  };
}

function parseKml(xmlText: string): ParsedGpsFile {
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");

  const waypoints: GpsPoint[] = [];
  const tracks: GpsTrack[] = [];

  doc.querySelectorAll("Placemark").forEach((placemark, index) => {
    const name =
      placemark.querySelector("name")?.textContent ??
      `KML Feature ${index + 1}`;

    const pointText =
      placemark.querySelector("Point coordinates")?.textContent;

    if (pointText) {
      const [lng, lat] = pointText.trim().split(",").map(Number);

      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        waypoints.push({
          id: createId("kml-point"),
          name,
          lat,
          lng,
          source: "KML",
          type: "waypoint",
        });
      }
    }

    const lineText =
      placemark.querySelector("LineString coordinates")?.textContent;

    if (lineText) {
      const points = lineText
        .trim()
        .split(/\s+/)
        .map((pair, pointIndex) => {
          const [lng, lat] = pair.split(",").map(Number);

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return {
            id: createId("kml-trackpoint"),
            name: `${name} Point ${pointIndex + 1}`,
            lat,
            lng,
            source: "KML" as const,
            type: "trackpoint" as const,
          };
        })
        .filter((point): point is NonNullable<typeof point> => point !== null);

      if (points.length > 0) {
        tracks.push({
          id: createId("kml-track"),
          name,
          points,
          source: "KML",
        });
      }
    }
  });

  return {
    waypoints,
    tracks,
    warnings: [],
  };
}

function parseCsv(csvText: string): ParsedGpsFile {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("CSV kosong atau tiada data.");
  }

  const headers = lines[0]
    .split(",")
    .map((header) => header.trim().toLowerCase());

  const latIndex = headers.findIndex((h) =>
    ["lat", "latitude", "y"].includes(h),
  );

  const lngIndex = headers.findIndex((h) =>
    ["lng", "lon", "long", "longitude", "x"].includes(h),
  );

  const nameIndex = headers.findIndex((h) =>
    ["name", "nama", "point", "id"].includes(h),
  );

  if (latIndex < 0 || lngIndex < 0) {
    throw new Error("CSV mesti ada column lat dan lng.");
  }

  const waypoints = lines
    .slice(1)
    .map((row, index) => {
      const cols = row.split(",").map((col) => col.trim());

      const lat = Number(cols[latIndex]);
      const lng = Number(cols[lngIndex]);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        id: createId("csv-point"),
        name:
          nameIndex >= 0 && cols[nameIndex]
            ? cols[nameIndex]
            : `CSV Point ${index + 1}`,
        lat,
        lng,
        source: "CSV" as const,
        type: "waypoint" as const,
      };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  return {
    waypoints,
    tracks: [],
    warnings: [],
  };
}

