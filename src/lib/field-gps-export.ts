import type {
  FieldGpsPoint,
  FieldGpsTrackPoint,
} from "./field-gps.types";

import {
  FIELD_GPS_DISCLAIMER,
  KEYED_COORDINATE_DISCLAIMER,
} from "./field-gps";

export interface FieldGpsExportInput {
  recordName?: string;
  points: FieldGpsPoint[];
  estimatedAreaM2?: number | null;
  polygonCoordinates?: Array<{
    lat: number;
    lng: number;
  }>;
  trackLog?: FieldGpsTrackPoint[];
  offlineMapNote?: string;
}

function escapeXml(
  value: string,
): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[character] ?? character,
  );
}

function csvCell(
  value: string | number | undefined | null,
): string {
  const text =
    value === undefined ||
    value === null
      ? ""
      : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

export function buildFieldGpsCsv(
  points: FieldGpsPoint[],
): string {
  const header = [
    "label",
    "latitude",
    "longitude",
    "accuracyMeters",
    "qualityGrade",
    "source",
    "captureMethod",
    "sampleCount",
    "occupationSeconds",
    "timestamp",
    "note",
  ];

  return [
    header.join(","),
    ...points.map(
      (point) =>
        [
          point.label,
          point.latitude,
          point.longitude,
          point.accuracyMeters,
          point.qualityGrade,
          point.source,
          point.captureMethod,
          point.sampleCount,
          point.occupationSeconds,
          point.timestamp,
          point.note,
        ]
          .map(csvCell)
          .join(","),
    ),
  ].join("\n");
}

function coordinatesText(
  coordinates: Array<{
    lat: number;
    lng: number;
  }>,
): string {
  return coordinates
    .map(
      (coordinate) =>
        `${coordinate.lng},${coordinate.lat},0`,
    )
    .join(" ");
}

export function buildFieldGpsKml(
  input: FieldGpsExportInput,
): string {
  const closedPolygon =
    input.polygonCoordinates &&
    input.polygonCoordinates.length >= 3
      ? [
          ...input.polygonCoordinates,
          input.polygonCoordinates[0],
        ]
      : [];
  const hasTrack =
    Boolean(
      input.trackLog &&
        input.trackLog.length >= 2,
    );

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeXml(input.recordName?.trim() || "Preliminary Field GPS Capture")}</name>
    <description>${escapeXml(FIELD_GPS_DISCLAIMER)}</description>
    <Style id="field-gps-point"><IconStyle><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/paddle/blu-circle.png</href></Icon></IconStyle></Style>
    <Style id="field-gps-polygon"><LineStyle><color>ff2563eb</color><width>3</width></LineStyle><PolyStyle><color>332563eb</color></PolyStyle></Style>
    ${input.points
      .map(
        (point) => `
    <Placemark>
      <name>${escapeXml(point.label)}</name>
      <styleUrl>#field-gps-point</styleUrl>
      <description>${escapeXml(
        [
          "Status: preliminary approximate WGS84 field reference only",
          `Source: ${point.source === "keyed-coordinate" ? "Keyed coordinate" : "Phone GPS"}`,
          `Accuracy: ${point.source === "keyed-coordinate" ? "Not measured / user-entered" : `${point.accuracyMeters?.toFixed(1) ?? "unknown"} m`}`,
          `Quality grade: ${point.qualityGrade}`,
          `Capture method: ${point.captureMethod}`,
          `Sample count: ${point.sampleCount}`,
          `Occupation seconds: ${point.occupationSeconds}`,
          `Note: ${point.note ?? ""}`,
        ].join("\n"),
      )}</description>
      <Point><coordinates>${point.longitude},${point.latitude},0</coordinates></Point>
    </Placemark>`,
      )
      .join("")}
    ${
      closedPolygon.length > 0
        ? `<Placemark>
      <name>Preliminary approximate field polygon</name>
      <styleUrl>#field-gps-polygon</styleUrl>
      <description>${escapeXml(
        `Estimated area only: ${input.estimatedAreaM2?.toFixed(2) ?? "not calculated"} m2`,
      )}</description>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinatesText(closedPolygon)}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`
        : ""
    }
    ${
      hasTrack
        ? `<Placemark>
      <name>Preliminary phone GPS track log</name>
      <LineString><tessellate>1</tessellate><coordinates>${coordinatesText(
        input.trackLog!.map(
          (point) => ({
            lat:
              point.latitude,
            lng:
              point.longitude,
          }),
        ),
      )}</coordinates></LineString>
    </Placemark>`
        : ""
    }
  </Document>
</kml>`;
}

export async function exportFieldGpsPdf(
  input: FieldGpsExportInput,
): Promise<void> {
  const {
    jsPDF,
  } = await import("jspdf");
  const pdf =
    new jsPDF({
      format:
        "a4",
      orientation:
        "landscape",
      unit:
        "mm",
    });
  const margin = 12;
  let y = margin;
  const lineHeight = 6;

  const write = (
    text: string,
    size = 9,
  ) => {
    pdf.setFontSize(size);
    const lines =
      pdf.splitTextToSize(
        text,
        270,
      );
    pdf.text(
      lines,
      margin,
      y,
    );
    y +=
      lines.length *
        lineHeight;
  };

  pdf.setFont("helvetica", "bold");
  write(
    "Preliminary Field GPS Capture",
    16,
  );
  pdf.setFont("helvetica", "normal");
  write("SabahLot powered by Myukur");
  write(
    `Date/time generated: ${new Date().toLocaleString("en-MY")}`,
  );
  write(
    `Record name: ${input.recordName?.trim() || "Not provided"}`,
  );
  write(
    `Estimated area only: ${
      typeof input.estimatedAreaM2 === "number"
        ? `${input.estimatedAreaM2.toFixed(2)} m2`
        : "Not generated"
    }`,
  );

  if (input.offlineMapNote) {
    write(
      `Offline map note: ${input.offlineMapNote}`,
    );
  }

  y += 2;
  pdf.setFont("helvetica", "bold");
  write("Point table", 11);
  pdf.setFont("helvetica", "normal");

  input.points.forEach(
    (point) => {
      if (y > 182) {
        pdf.addPage();
        y = margin;
      }

      write(
        [
          point.label,
          `Lat ${point.latitude.toFixed(7)}`,
          `Lng ${point.longitude.toFixed(7)}`,
          `Source ${point.source === "keyed-coordinate" ? "Keyed coordinate" : "Phone GPS"}`,
          `Accuracy ${point.source === "keyed-coordinate" ? "Not measured / user-entered" : `${point.accuracyMeters?.toFixed(1) ?? "unknown"} m`}`,
          `Grade ${point.qualityGrade}`,
          point.captureMethod,
          `Samples ${point.sampleCount}`,
          `Occupation ${point.occupationSeconds}s`,
          point.timestamp,
          point.note ? `Note ${point.note}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
      );
    },
  );

  y += 2;
  pdf.setFont("helvetica", "bold");
  write("Disclaimer", 11);
  pdf.setFont("helvetica", "normal");
  write(FIELD_GPS_DISCLAIMER, 8);
  write(KEYED_COORDINATE_DISCLAIMER, 8);

  pdf.save("preliminary-field-gps-capture.pdf");
}

export function downloadTextFile(
  content: string,
  fileName: string,
  type: string,
): void {
  const url =
    URL.createObjectURL(
      new Blob(
        [content],
        {
          type,
        },
      ),
    );
  const anchor =
    document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
