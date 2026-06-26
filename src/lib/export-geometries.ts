import type {
  Coordinate,
  PolygonResult,
} from "@/app/components/Map";

export const PRELIMINARY_EXPORT_DISCLAIMER =
  "SabahLot output is for preliminary reference only. It is not an official survey plan, not a certified boundary plan, and must not be used as legal proof of boundary, ownership, approval, subdivision or land title status. All coordinates, boundaries and areas must be verified by the relevant authority, licensed surveyor or professional adviser before official use.";

export interface PreliminaryExportMetadata {
  recordTitle: string;
  village: string;
  district: string;
  generatedAt: string;
}

export interface PreliminaryExportInput {
  polygon: PolygonResult;
  metadata: PreliminaryExportMetadata;
}

export interface PreliminaryExportDocument {
  content: string;
  fileName: string;
  mimeType: string;
}

function safeFileName(value: string): string {
  return (
    value
      .trim()
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "sabahlot-preliminary"
  );
}

function closeRing(coordinates: Coordinate[]): Coordinate[] {
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];

  if (!first || !last) {
    return coordinates;
  }

  if (first.lat === last.lat && first.lng === last.lng) {
    return coordinates;
  }

  return [
    ...coordinates,
    first,
  ];
}

function xmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    })[character] ?? character,
  );
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    })[character] ?? character,
  );
}

function csvCell(value: string | number): string {
  const text = String(value);

  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function formatNumber(value: number, decimals = 2): string {
  return Number.isFinite(value)
    ? value.toFixed(decimals)
    : "0.00";
}

function coordinateRows(coordinates: Coordinate[]): string {
  return coordinates
    .map((coordinate) => `${coordinate.lng},${coordinate.lat},0`)
    .join(" ");
}

function metadataRows(input: PreliminaryExportInput): Array<[string, string]> {
  const {
    metadata,
    polygon,
  } = input;

  return [
    [
      "Record Title",
      metadata.recordTitle,
    ],
    [
      "Village",
      metadata.village || "Not provided",
    ],
    [
      "District",
      metadata.district || "Not provided",
    ],
    [
      "Estimated Area",
      `${formatNumber(polygon.areaM2)} m2`,
    ],
    [
      "Estimated Perimeter",
      `${formatNumber(polygon.perimeterM)} m`,
    ],
    [
      "Point Count",
      String(polygon.coordinates.length),
    ],
    [
      "Date Generated",
      metadata.generatedAt,
    ],
    [
      "Disclaimer",
      PRELIMINARY_EXPORT_DISCLAIMER,
    ],
  ];
}

export function buildPreliminaryGeoJson(
  input: PreliminaryExportInput,
): PreliminaryExportDocument {
  const {
    polygon,
    metadata,
  } = input;
  const ring = closeRing(polygon.coordinates).map((coordinate) => [
    coordinate.lng,
    coordinate.lat,
  ]);
  const content = JSON.stringify(
    {
      type: "FeatureCollection",
      name: metadata.recordTitle,
      features: [
        {
          type: "Feature",
          properties: {
            record_title: metadata.recordTitle,
            village: metadata.village,
            district: metadata.district,
            area_estimate_m2: polygon.areaM2,
            perimeter_estimate_m: polygon.perimeterM,
            point_count: polygon.coordinates.length,
            date_generated: metadata.generatedAt,
            disclaimer: PRELIMINARY_EXPORT_DISCLAIMER,
            generated_by: "SabahLot",
            status: "preliminary_reference_only",
          },
          geometry: {
            type: "Polygon",
            coordinates: [
              ring,
            ],
          },
        },
      ],
    },
    null,
    2,
  );

  return {
    content,
    fileName: `${safeFileName(metadata.recordTitle)}.geojson`,
    mimeType: "application/geo+json",
  };
}

export function buildPreliminaryKml(
  input: PreliminaryExportInput,
): PreliminaryExportDocument {
  const {
    metadata,
  } = input;
  const rows = metadataRows(input)
    .map(
      ([label, value]) =>
        `<strong>${xmlEscape(label)}</strong>: ${xmlEscape(value)}`,
    )
    .join("<br/>");
  const coordinates = coordinateRows(
    closeRing(input.polygon.coordinates),
  );
  const content =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
    `<name>${xmlEscape(metadata.recordTitle)}</name>` +
    `<Style id="sabahlot-preliminary-polygon"><LineStyle><color>ff1d4ed8</color><width>3</width></LineStyle><PolyStyle><color>331d4ed8</color></PolyStyle></Style>` +
    `<Placemark><name>${xmlEscape(metadata.recordTitle)}</name>` +
    `<styleUrl>#sabahlot-preliminary-polygon</styleUrl>` +
    `<description><![CDATA[${rows}]]></description>` +
    `<ExtendedData>` +
    metadataRows(input)
      .map(
        ([label, value]) =>
          `<Data name="${xmlEscape(label)}"><value>${xmlEscape(value)}</value></Data>`,
      )
      .join("") +
    `</ExtendedData>` +
    `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates}</coordinates></LinearRing></outerBoundaryIs></Polygon>` +
    `</Placemark></Document></kml>`;

  return {
    content,
    fileName: `${safeFileName(metadata.recordTitle)}.kml`,
    mimeType: "application/vnd.google-earth.kml+xml",
  };
}

export function buildPreliminaryCsv(
  input: PreliminaryExportInput,
): PreliminaryExportDocument {
  const {
    metadata,
    polygon,
  } = input;
  const header = [
    "latitude",
    "longitude",
    "point_number",
    "record_title",
    "village",
    "district",
    "area_estimate_m2",
    "perimeter_estimate_m",
    "date_generated",
    "disclaimer",
  ];
  const rows = polygon.coordinates.map((coordinate, index) => [
    coordinate.lat,
    coordinate.lng,
    index + 1,
    metadata.recordTitle,
    metadata.village,
    metadata.district,
    formatNumber(polygon.areaM2),
    formatNumber(polygon.perimeterM),
    metadata.generatedAt,
    PRELIMINARY_EXPORT_DISCLAIMER,
  ]);
  const content = [
    header,
    ...rows,
  ]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");

  return {
    content,
    fileName: `${safeFileName(metadata.recordTitle)}.csv`,
    mimeType: "text/csv",
  };
}

export function buildPreliminaryPrintHtml(
  input: PreliminaryExportInput,
): string {
  const {
    metadata,
    polygon,
  } = input;
  const summaryRows = metadataRows(input)
    .map(
      ([label, value]) =>
        `<tr><th>${htmlEscape(label)}</th><td>${htmlEscape(value)}</td></tr>`,
    )
    .join("");
  const coordinateRowsHtml = polygon.coordinates
    .map(
      (coordinate, index) =>
        `<tr><td>${index + 1}</td><td>${formatNumber(
          coordinate.lat,
          7,
        )}</td><td>${formatNumber(coordinate.lng, 7)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${htmlEscape(metadata.recordTitle)} - SabahLot Preliminary Output</title>
    <style>
      body { color: #0f172a; font-family: Arial, sans-serif; margin: 24px; }
      h1 { font-size: 22px; margin: 0 0 6px; }
      h2 { font-size: 15px; margin: 22px 0 8px; }
      p { font-size: 12px; line-height: 1.5; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      th, td { padding: 7px; border: 1px solid #cbd5e1; text-align: left; vertical-align: top; }
      th { width: 30%; background: #f1f5f9; }
      .disclaimer { margin-top: 18px; padding: 10px; border: 1px solid #f59e0b; background: #fffbeb; }
      @media print { body { margin: 12mm; } button { display: none; } }
    </style>
  </head>
  <body>
    <button onclick="window.print()">Print / Save PDF</button>
    <h1>SabahLot Preliminary Output</h1>
    <p>${htmlEscape(metadata.recordTitle)} - generated ${htmlEscape(
      metadata.generatedAt,
    )}</p>
    <h2>Record Summary</h2>
    <table>${summaryRows}</table>
    <h2>Coordinate Table</h2>
    <table>
      <thead><tr><th>Point</th><th>Latitude</th><th>Longitude</th></tr></thead>
      <tbody>${coordinateRowsHtml}</tbody>
    </table>
    <p class="disclaimer">${htmlEscape(PRELIMINARY_EXPORT_DISCLAIMER)}</p>
  </body>
</html>`;
}
