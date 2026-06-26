import type {
  GpsPoint,
  GpsTrack,
} from "./gps-types";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildGpx(params: {
  name: string;
  waypoints?: GpsPoint[];
  tracks?: GpsTrack[];
}) {
  const waypointsXml =
    params.waypoints
      ?.map(
        (point) => `
  <wpt lat="${point.lat}" lon="${point.lng}">
    <name>${escapeXml(point.name)}</name>
  </wpt>`,
      )
      .join("") ?? "";

  const tracksXml =
    params.tracks
      ?.map(
        (track) => `
  <trk>
    <name>${escapeXml(track.name)}</name>
    <trkseg>
${track.points
  .map(
    (point) => `      <trkpt lat="${point.lat}" lon="${point.lng}">
        <name>${escapeXml(point.name)}</name>
      </trkpt>`,
  )
  .join("\n")}
    </trkseg>
  </trk>`,
      )
      .join("") ?? "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SabahLot" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(params.name)}</name>
    <desc>SabahLot preliminary GPS export. Not an official survey plan.</desc>
  </metadata>
${waypointsXml}
${tracksXml}
</gpx>`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = "application/gpx+xml",
) {
  const blob = new Blob([content], {
    type: mimeType,
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
