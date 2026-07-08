import type {
  FieldGpsPoint,
  FieldGpsTrackPoint,
} from "./field-gps.types";

import {
  FIELD_GPS_DISCLAIMER,
  KEYED_COORDINATE_DISCLAIMER,
} from "./field-gps";

import {
  getGpsAccuracyStatus,
} from "./gps-quality";

export const PRELIMINARY_FIELD_ASSIST_DISCLAIMER =
  "This report is for preliminary field assistance only and is not a cadastral survey, not a legal boundary determination, and not a replacement for licensed survey work or JTU Sabah approval.";

export interface ArStakeoutTargetSummary {
  name: string;
  lat: number;
  lng: number;
}

export interface ArStakeoutCurrentLocation {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
}

export interface ArStakeoutSavedTarget {
  id: string;
  name: string;
  lat: number;
  lng: number;
  createdAt: string;
  lastUsedAt?: string;
}

export interface ArStakeoutPdfInput {
  activeTarget: ArStakeoutTargetSummary | null;
  currentLocation: ArStakeoutCurrentLocation | null;
  savedTargets: ArStakeoutSavedTarget[];
}

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

function degreesToRadians(
  value: number,
): number {
  return (
    value *
    Math.PI
  ) / 180;
}

function distanceMeters(
  start: {
    lat: number;
    lng: number;
  },
  end: {
    lat: number;
    lng: number;
  },
): number {
  const earthRadiusMeters =
    6378137;
  const latitude1 =
    degreesToRadians(
      start.lat,
    );
  const latitude2 =
    degreesToRadians(
      end.lat,
    );
  const latitudeDelta =
    degreesToRadians(
      end.lat - start.lat,
    );
  const longitudeDelta =
    degreesToRadians(
      end.lng - start.lng,
    );
  const haversine =
    Math.sin(
      latitudeDelta / 2,
    ) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(
        longitudeDelta / 2,
      ) ** 2;

  return (
    earthRadiusMeters *
    2 *
    Math.atan2(
      Math.sqrt(haversine),
      Math.sqrt(
        1 - haversine,
      ),
    )
  );
}

function estimatedPerimeterMeters(
  coordinates?: Array<{
    lat: number;
    lng: number;
  }>,
): number | null {
  if (
    !coordinates ||
    coordinates.length < 3
  ) {
    return null;
  }

  return coordinates.reduce(
    (
      total,
      coordinate,
      index,
    ) =>
      total +
      distanceMeters(
        coordinate,
        coordinates[
          (index + 1) %
            coordinates.length
        ],
      ),
    0,
  );
}

function captureSourceSummary(
  points: FieldGpsPoint[],
): string {
  const hasPhoneGps =
    points.some(
      (point) =>
        point.source ===
        "phone-gps",
    );
  const hasKeyed =
    points.some(
      (point) =>
        point.source ===
        "keyed-coordinate",
    );

  if (
    hasPhoneGps &&
    hasKeyed
  ) {
    return "Mixed Phone GPS + Keyed Coordinate";
  }

  if (hasKeyed) {
    return "Keyed Coordinate";
  }

  if (hasPhoneGps) {
    return "Phone GPS";
  }

  return "Not provided";
}

function captureMethodSummary(
  points: FieldGpsPoint[],
): string {
  const methods =
    new Set(
      points.map(
        (point) =>
          point.captureMethod,
      ),
    );

  if (methods.size === 0) {
    return "Not provided";
  }

  if (methods.size > 1) {
    return "Mixed methods";
  }

  switch (
    points[0]?.captureMethod
  ) {
    case "manual-key-in":
      return "Manual key-in";
    case "single":
      return "Single GPS";
    case "best-fix":
      return "Best fix";
    case "averaged":
      return "Averaged GPS";
    default:
      return "Mixed methods";
  }
}

function accuracySummary(
  points: FieldGpsPoint[],
): string {
  const hasKeyed =
    points.some(
      (point) =>
        point.source ===
        "keyed-coordinate",
    );
  const phoneAccuracies =
    points
      .filter(
        (point) =>
          point.source ===
            "phone-gps" &&
          typeof point.accuracyMeters ===
            "number",
      )
      .map(
        (point) =>
          point.accuracyMeters as number,
      );

  if (
    phoneAccuracies.length === 0
  ) {
    return hasKeyed
      ? "Not measured / user-entered"
      : "Not available";
  }

  const best =
    Math.min(...phoneAccuracies);
  const worst =
    Math.max(...phoneAccuracies);
  const average =
    phoneAccuracies.reduce(
      (
        total,
        value,
      ) =>
        total + value,
      0,
    ) /
    phoneAccuracies.length;
  const phoneSummary =
    `Best accuracy: +/-${best.toFixed(1)}m; Worst accuracy: +/-${worst.toFixed(1)}m; Average accuracy: +/-${average.toFixed(1)}m`;

  return hasKeyed
    ? `${phoneSummary}; keyed coordinates not measured.`
    : phoneSummary;
}

function qualitySummary(
  points: FieldGpsPoint[],
): string {
  const counts =
    points.reduce<
      Record<
        FieldGpsPoint["qualityGrade"],
        number
      >
    >(
      (
        current,
        point,
      ) => ({
        ...current,
        [point.qualityGrade]:
          current[
            point.qualityGrade
          ] + 1,
      }),
      {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
      },
    );
  const summary =
    (
      [
        "A",
        "B",
        "C",
        "D",
      ] as const
    )
      .filter(
        (grade) =>
          counts[grade] > 0,
      )
      .map(
        (grade) =>
          `${grade}: ${counts[grade]}`,
      )
      .join(", ");

  return summary || "Not provided";
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

export function buildFieldGpsGeoJson(
  points: FieldGpsPoint[],
): string {
  const featureCollection = {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [point.longitude, point.latitude],
      },
      properties: {
        id: point.id,
        name: point.label,
        coordinateSystem: "WGS84",
        source: point.source,
        notes: point.note ?? "",
        createdAt: point.timestamp,
      },
    })),
  };

  return JSON.stringify(featureCollection, null, 2);
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
        "portrait",
      unit:
        "mm",
    });
  const margin = 12;
  let y = margin;
  const lineHeight = 6;
  const pageWidth =
    pdf.internal.pageSize.getWidth();
  const pageHeight =
    pdf.internal.pageSize.getHeight();
  const contentWidth =
    pageWidth - margin * 2;
  const generatedAt =
    new Date().toLocaleString("en-MY");
  const perimeterM =
    estimatedPerimeterMeters(
      input.polygonCoordinates,
    );

  const write = (
    text: string,
    size = 9,
  ) => {
    pdf.setFontSize(size);
    const lines =
      pdf.splitTextToSize(
        text,
        contentWidth,
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

  const titleBlockRows: Array<
    readonly [string, string]
  > = [
    [
      "Output",
      "Preliminary Field GPS Capture",
    ],
    [
      "Branding",
      "SabahLot powered by Myukur",
    ],
    [
      "Record name",
      input.recordName?.trim() ||
        "Not provided",
    ],
    [
      "Coordinate system",
      "WGS84 Latitude/Longitude",
    ],
    [
      "Capture source",
      captureSourceSummary(
        input.points,
      ),
    ],
    [
      "Capture method",
      captureMethodSummary(
        input.points,
      ),
    ],
    [
      "Points observed",
      `${input.points.length} ${
        input.points.length === 1
          ? "point"
          : "points"
      }`,
    ],
    [
      "Estimated area only",
      typeof input.estimatedAreaM2 ===
      "number"
        ? `${input.estimatedAreaM2.toFixed(2)} m2`
        : "Not generated",
    ],
    [
      "Estimated perimeter only",
      perimeterM === null
        ? "Not generated"
        : `${perimeterM.toFixed(2)} m`,
    ],
    [
      "Accuracy summary",
      accuracySummary(
        input.points,
      ),
    ],
    [
      "Quality summary",
      qualitySummary(
        input.points,
      ),
    ],
    [
      "Generated",
      generatedAt,
    ],
    [
      "Status",
      "Preliminary only - not a legal survey plan",
    ],
  ];

  const drawTitleBlock = () => {
    const blockX =
      margin;
    const blockY =
      y;
    const headingHeight =
      9;
    const rowHeight =
      9;
    const columnGap =
      4;
    const blockHeight =
      headingHeight +
      Math.ceil(
        titleBlockRows.length / 2,
      ) *
        rowHeight +
      6;
    const columnWidth =
      (contentWidth - columnGap) /
      2;

    pdf.setDrawColor(
      148,
      163,
      184,
    );
    pdf.setFillColor(
      248,
      250,
      252,
    );
    pdf.rect(
      blockX,
      blockY,
      contentWidth,
      blockHeight,
      "FD",
    );

    pdf.setFillColor(
      15,
      23,
      42,
    );
    pdf.rect(
      blockX,
      blockY,
      contentWidth,
      headingHeight,
      "F",
    );
    pdf.setFont(
      "helvetica",
      "bold",
    );
    pdf.setTextColor(
      255,
      255,
      255,
    );
    pdf.setFontSize(10);
    pdf.text(
      "FIELD OBSERVATION SUMMARY",
      blockX + 3,
      blockY + 6.2,
    );

    pdf.setTextColor(
      15,
      23,
      42,
    );
    titleBlockRows.forEach(
      (
        [
          label,
          value,
        ],
        index,
      ) => {
        const column =
          index <
          Math.ceil(
            titleBlockRows.length / 2,
          )
            ? 0
            : 1;
        const row =
          column === 0
            ? index
            : index -
              Math.ceil(
                titleBlockRows.length / 2,
              );
        const x =
          blockX +
          3 +
          column *
            (columnWidth + columnGap);
        const rowY =
          blockY +
          headingHeight +
          5 +
          row * rowHeight;

        pdf.setFont(
          "helvetica",
          "bold",
        );
        pdf.setFontSize(7.5);
        pdf.setTextColor(
          71,
          85,
          105,
        );
        pdf.text(
          label,
          x,
          rowY,
        );
        pdf.setFont(
          "helvetica",
          "normal",
        );
        pdf.setFontSize(8);
        pdf.setTextColor(
          15,
          23,
          42,
        );
        const wrapped =
          pdf.splitTextToSize(
            value,
            columnWidth - 4,
          );
        pdf.text(
          wrapped.slice(0, 2),
          x,
          rowY + 3.7,
        );
      },
    );

    y +=
      blockHeight + 6;
    pdf.setTextColor(
      15,
      23,
      42,
    );
  };

  pdf.setFont("helvetica", "bold");
  write(
    "Preliminary Field GPS Capture",
    16,
  );
  pdf.setFont("helvetica", "normal");
  drawTitleBlock();

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
      if (
        y >
        pageHeight - margin - 35
      ) {
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

export async function exportPreliminaryFieldAssistPdf(
  input: ArStakeoutPdfInput,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    format: "a3",
    orientation: "portrait",
    unit: "mm",
  });
  const margin = 14;
  let y = margin;
  const lineHeight = 6;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const generatedAt = new Date().toLocaleString("en-MY");

  const write = (text: string, size = 10) => {
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, contentWidth);
    pdf.text(lines, margin, y);
    y += lines.length * lineHeight;
  };

  const heading = (text: string) => {
    y += 2;
    pdf.setFont("helvetica", "bold");
    write(text, 12);
    pdf.setFont("helvetica", "normal");
  };

  pdf.setFont("helvetica", "bold");
  write("SabahLot Preliminary Field Assist Report", 18);
  pdf.setFont("helvetica", "normal");
  write(`Generated: ${generatedAt}`, 9);

  heading("Active Target Point");
  if (input.activeTarget) {
    write(
      [
        `Name: ${input.activeTarget.name}`,
        `Latitude: ${input.activeTarget.lat.toFixed(7)}`,
        `Longitude: ${input.activeTarget.lng.toFixed(7)}`,
      ].join("   "),
    );
  } else {
    write("No active target point set.");
  }

  heading("Current Location");
  if (input.currentLocation) {
    const accuracyStatus = getGpsAccuracyStatus(
      input.currentLocation.accuracy,
    );
    write(
      [
        `Latitude: ${input.currentLocation.latitude.toFixed(7)}`,
        `Longitude: ${input.currentLocation.longitude.toFixed(7)}`,
        `Accuracy: ${
          input.currentLocation.accuracy !== null
            ? `+/- ${input.currentLocation.accuracy.toFixed(1)} m`
            : "unknown"
        } (${accuracyStatus})`,
        `Timestamp: ${input.currentLocation.timestamp}`,
      ].join("   "),
    );

    if (accuracyStatus === "Poor" || accuracyStatus === "No Fix") {
      write("GPS accuracy rendah. Gunakan sebagai panduan awal sahaja.", 9);
    }
  } else {
    write("No current location captured.");
  }

  heading(`Saved Points (${input.savedTargets.length})`);
  if (input.savedTargets.length === 0) {
    write("No saved points.");
  } else {
    input.savedTargets.forEach((point) => {
      if (y > pageHeight - margin - 35) {
        pdf.addPage();
        y = margin;
      }

      write(
        [
          point.name,
          `Lat ${point.lat.toFixed(7)}`,
          `Lng ${point.lng.toFixed(7)}`,
          `Created ${point.createdAt}`,
          point.lastUsedAt ? `Last used ${point.lastUsedAt}` : "",
        ]
          .filter(Boolean)
          .join(" | "),
        9,
      );
    });
  }

  heading("GPS Accuracy Note");
  write(
    "Phone GPS accuracy is approximate. Good: <=5 m, Moderate: 5-15 m, Poor: >15 m. Never treat phone GPS as centimetre-level accuracy.",
    9,
  );

  heading("Disclaimer");
  write(PRELIMINARY_FIELD_ASSIST_DISCLAIMER, 9);

  pdf.save("sabahlot-preliminary-field-assist-report.pdf");
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
