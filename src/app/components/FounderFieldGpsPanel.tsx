"use client";

import {
  type ChangeEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type GpsStatus =
  | "Ready"
  | "Capturing"
  | "Captured"
  | "Error";

type FounderGpsCategory =
  | "Boundary point"
  | "Access point"
  | "Road edge"
  | "River / drain"
  | "Building / house"
  | "Old peg / marker"
  | "Photo location"
  | "Other";

interface FounderGpsPoint {
  id: string;
  pointId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  createdAt: string;
  note: string;
  category: FounderGpsCategory;
}

interface CurrentPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
}

const STORAGE_KEY = "sabahlot-founder-field-gps-test-v1";
const SESSION_STORAGE_KEY = "sabahlot-founder-field-gps-session-name-v1";
const DEFAULT_SESSION_NAME = "Founder Field Test";
const EARTH_RADIUS_METERS = 6371008.8;
const DISCLAIMER =
  "Field GPS ini adalah untuk rujukan awal dan ujian lapangan sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan, bukan pengesahan koordinat sah, dan bukan pengganti juruukur berlesen.";

const categoryOptions: FounderGpsCategory[] = [
  "Boundary point",
  "Access point",
  "Road edge",
  "River / drain",
  "Building / house",
  "Old peg / marker",
  "Photo location",
  "Other",
];

function normalizeCategory(value: unknown): FounderGpsCategory {
  return categoryOptions.includes(value as FounderGpsCategory)
    ? (value as FounderGpsCategory)
    : "Other";
}

function isStoredPoint(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Record<string, unknown>;

  return (
    typeof point.id === "string" &&
    typeof point.pointId === "string" &&
    typeof point.latitude === "number" &&
    typeof point.longitude === "number" &&
    (typeof point.accuracy === "number" || point.accuracy === null) &&
    typeof point.createdAt === "string" &&
    typeof point.note === "string"
  );
}

function loadPoints(): FounderGpsPoint[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .filter(isStoredPoint)
      .map((point) => ({
        id: point.id as string,
        pointId: point.pointId as string,
        latitude: point.latitude as number,
        longitude: point.longitude as number,
        accuracy: point.accuracy as number | null,
        createdAt: point.createdAt as string,
        note: point.note as string,
        category: normalizeCategory(point.category),
      }));
  } catch {
    return [];
  }
}

function savePoints(points: FounderGpsPoint[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
}

function loadSessionName(): string {
  if (typeof window === "undefined") {
    return DEFAULT_SESSION_NAME;
  }

  return window.localStorage.getItem(SESSION_STORAGE_KEY)?.trim() || DEFAULT_SESSION_NAME;
}

function saveSessionName(value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    SESSION_STORAGE_KEY,
    value.trim() || DEFAULT_SESSION_NAME,
  );
}

function nextPointId(points: FounderGpsPoint[]): string {
  const highest = points.reduce((max, point) => {
    const match = /^P(\d+)$/i.exec(point.pointId.trim());

    if (!match) {
      return max;
    }

    return Math.max(max, Number(match[1]));
  }, 0);

  return `P${highest + 1}`;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function calculateDistanceMeters(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
): number {
  const startLat = degreesToRadians(startLatitude);
  const endLat = degreesToRadians(endLatitude);
  const latDelta = degreesToRadians(endLatitude - startLatitude);
  const lngDelta = degreesToRadians(endLongitude - startLongitude);

  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(startLat) *
      Math.cos(endLat) *
      Math.sin(lngDelta / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearingDegrees(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number,
): number {
  const startLat = degreesToRadians(startLatitude);
  const endLat = degreesToRadians(endLatitude);
  const lngDelta = degreesToRadians(endLongitude - startLongitude);

  const y = Math.sin(lngDelta) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(lngDelta);

  return (radiansToDegrees(Math.atan2(y, x)) + 360) % 360;
}

function bearingToDirection(bearing: number): string {
  const directions = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];
  const index = Math.round(bearing / 45) % directions.length;

  return directions[index];
}

function formatCoordinate(value: number): string {
  return value.toFixed(7);
}

function formatAccuracy(value: number | null): string {
  if (value === null) {
    return "Not available";
  }

  return `+/- ${value.toFixed(1)} m`;
}

function formatDistance(value: number): string {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(2)} km`;
  }

  return `${value.toFixed(0)} m`;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not captured";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}

function csvCell(value: string | number | null): string {
  const text = value === null ? "" : String(value);

  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function focusMapToPoint(point: FounderGpsPoint) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("sabahlot:find-coordinate", {
      detail: {
        latitude: point.latitude,
        longitude: point.longitude,
        label: point.pointId,
        note: `${point.category}${point.note ? ` - ${point.note}` : ""}`,
      },
    }),
  );
}

function syncFounderMarkers(points: FounderGpsPoint[], selectedPointId: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("sabahlot:founder-gps-points", {
      detail: {
        points: points.map((point) => ({
          pointId: point.pointId,
          latitude: point.latitude,
          longitude: point.longitude,
          accuracy: point.accuracy,
          createdAt: point.createdAt,
          note: point.note,
          category: point.category,
          selected: point.id === selectedPointId,
        })),
      },
    }),
  );
}

function buildCsv(points: FounderGpsPoint[]): string {
  const header = [
    "Point ID",
    "Category",
    "Note",
    "Latitude",
    "Longitude",
    "Accuracy (m)",
    "Timestamp",
  ];
  const rows = points.map((point) => [
    point.pointId,
    point.category,
    point.note,
    point.latitude,
    point.longitude,
    point.accuracy,
    point.createdAt,
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function buildKml(points: FounderGpsPoint[], sessionName: string): string {
  const placemarks = points
    .map(
      (point) => `
        <Placemark>
          <name>${escapeHtml(point.pointId)} - ${escapeHtml(point.category)}</name>
          <description>${escapeHtml(
            [
              point.note || "No note",
              `Accuracy: ${formatAccuracy(point.accuracy)}`,
              `Captured: ${formatDateTime(point.createdAt)}`,
              DISCLAIMER,
            ].join("\n"),
          )}</description>
          <Point>
            <coordinates>${point.longitude},${point.latitude},0</coordinates>
          </Point>
        </Placemark>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${escapeHtml(sessionName || DEFAULT_SESSION_NAME)}</name>
    ${placemarks}
  </Document>
</kml>`;
}

function buildGeoJson(points: FounderGpsPoint[], sessionName: string): string {
  return JSON.stringify(
    {
      type: "FeatureCollection",
      name: sessionName || DEFAULT_SESSION_NAME,
      disclaimer: DISCLAIMER,
      features: points.map((point) => ({
        type: "Feature",
        properties: {
          pointId: point.pointId,
          category: point.category,
          note: point.note,
          accuracy: point.accuracy,
          timestamp: point.createdAt,
        },
        geometry: {
          type: "Point",
          coordinates: [point.longitude, point.latitude],
        },
      })),
    },
    null,
    2,
  );
}

function buildPlanHtml(points: FounderGpsPoint[], sessionName: string): string {
  const generatedAt = formatDateTime(new Date().toISOString());
  const rows = points
    .map(
      (point) => `
        <tr>
          <td>${escapeHtml(point.pointId)}</td>
          <td>${escapeHtml(point.category)}</td>
          <td>${formatCoordinate(point.latitude)}</td>
          <td>${formatCoordinate(point.longitude)}</td>
          <td>${escapeHtml(formatAccuracy(point.accuracy))}</td>
          <td>${escapeHtml(formatDateTime(point.createdAt))}</td>
          <td>${escapeHtml(point.note || "-")}</td>
        </tr>
      `,
    )
    .join("");

  return `<!doctype html>
    <html>
      <head>
        <title>SabahLot Preliminary Field Point Plan</title>
        <style>
          body {
            margin: 32px;
            color: #0f172a;
            font-family: Arial, sans-serif;
          }

          h1 {
            margin: 0 0 4px;
            font-size: 22px;
          }

          p {
            margin: 0 0 12px;
            color: #475569;
            font-size: 12px;
            line-height: 1.45;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }

          th,
          td {
            padding: 7px;
            border: 1px solid #cbd5e1;
            text-align: left;
            vertical-align: top;
          }

          th {
            background: #f1f5f9;
          }

          .warning {
            margin: 16px 0;
            padding: 10px;
            border: 1px solid #f59e0b;
            background: #fffbeb;
            color: #92400e;
            font-weight: 700;
          }
        </style>
      </head>
      <body>
        <h1>SabahLot Preliminary Field Point Plan</h1>
        <p>Session: ${escapeHtml(sessionName || DEFAULT_SESSION_NAME)}</p>
        <p>Project/session date: ${escapeHtml(generatedAt)}</p>
        <p>Total saved points: ${points.length}</p>
        <div class="warning">${escapeHtml(DISCLAIMER)}</div>
        <table>
          <thead>
            <tr>
              <th>Point ID</th>
              <th>Category</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Accuracy</th>
              <th>Date/time</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              '<tr><td colspan="7">No field GPS points saved.</td></tr>'
            }
          </tbody>
        </table>
      </body>
    </html>`;
}

export default function FounderFieldGpsPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [points, setPoints] = useState<FounderGpsPoint[]>(() => loadPoints());
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [category, setCategory] =
    useState<FounderGpsCategory>("Boundary point");
  const [sessionName, setSessionName] = useState(() => loadSessionName());
  const [currentPosition, setCurrentPosition] =
    useState<CurrentPosition | null>(null);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("Ready");
  const [statusMessage, setStatusMessage] =
    useState("Ready for internal founder field test.");
  const [permissionError, setPermissionError] = useState("");
  const [editingPointId, setEditingPointId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState("");
  const [pointSearch, setPointSearch] = useState("");

  const selectedPoint = useMemo(
    () =>
      points.find((point) => point.id === selectedPointId) ??
      points[0] ??
      null,
    [points, selectedPointId],
  );

  const navigationInfo = useMemo(() => {
    if (!selectedPoint || !currentPosition) {
      return null;
    }

    const distanceMeters = calculateDistanceMeters(
      currentPosition.latitude,
      currentPosition.longitude,
      selectedPoint.latitude,
      selectedPoint.longitude,
    );
    const bearingDegrees = calculateBearingDegrees(
      currentPosition.latitude,
      currentPosition.longitude,
      selectedPoint.latitude,
      selectedPoint.longitude,
    );

    return {
      distanceMeters,
      bearingDegrees,
      direction: bearingToDirection(bearingDegrees),
    };
  }, [currentPosition, selectedPoint]);

  const lastUpdated = points[0]?.createdAt ?? null;
  const visiblePoints = useMemo(() => {
    const query = pointSearch.trim().toLowerCase();

    if (!query) {
      return points;
    }

    return points.filter((point) =>
      [
        point.pointId,
        point.category,
        point.note,
        formatCoordinate(point.latitude),
        formatCoordinate(point.longitude),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [pointSearch, points]);

  useEffect(() => {
    syncFounderMarkers(points, selectedPointId);

    const timer = window.setTimeout(
      () => syncFounderMarkers(points, selectedPointId),
      800,
    );

    return () => window.clearTimeout(timer);
  }, [points, selectedPointId]);

  function updatePoints(nextPoints: FounderGpsPoint[]) {
    setPoints(nextPoints);
    savePoints(nextPoints);
  }

  function updateSessionName(value: string) {
    setSessionName(value);
    saveSessionName(value);
  }

  function handleGeolocationError(error: GeolocationPositionError) {
    setGpsStatus("Error");

    if (error.code === error.PERMISSION_DENIED) {
      setPermissionError("Browser GPS permission is blocked or denied.");
      setStatusMessage("Location permission denied.");
      return;
    }

    if (error.code === error.TIMEOUT) {
      setPermissionError("");
      setStatusMessage("GPS request timed out. Try again outdoors.");
      return;
    }

    setPermissionError("");
    setStatusMessage("Current GPS location is unavailable.");
  }

  function requestCurrentPosition(
    onSuccess: (position: GeolocationPosition) => void,
  ) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsStatus("Error");
      setPermissionError("Location services are not supported on this browser.");
      setStatusMessage("Location services are not supported on this browser.");
      return;
    }

    setGpsStatus("Capturing");
    setPermissionError("");
    setStatusMessage("Capturing phone GPS location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setGpsStatus("Captured");
        setCurrentPosition({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
          capturedAt: new Date().toISOString(),
        });
        onSuccess(position);
      },
      (error) => {
        handleGeolocationError(error);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 15000,
      },
    );
  }

  function handleMarkCurrentLocation() {
    requestCurrentPosition((position) => {
      const point: FounderGpsPoint = {
        id: `founder-gps-${Date.now()}`,
        pointId: nextPointId(points),
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
        createdAt: new Date().toISOString(),
        note: note.trim(),
        category,
      };
      const nextPoints = [point, ...points];

      updatePoints(nextPoints);
      setSelectedPointId(point.id);
      setNote("");
      setStatusMessage(`${point.pointId} saved to this browser.`);
      focusMapToPoint(point);
    });
  }

  function handleRefreshCurrentLocation() {
    requestCurrentPosition(() => {
      setStatusMessage("Current GPS refreshed for approximate navigation.");
    });
  }

  function handleSelectPoint(point: FounderGpsPoint) {
    setSelectedPointId(point.id);
    setStatusMessage(`${point.pointId} selected for Navigate.`);
    focusMapToPoint(point);
  }

  function handleDeletePoint(pointId: string) {
    const nextPoints = points.filter((point) => point.id !== pointId);

    updatePoints(nextPoints);

    if (selectedPointId === pointId) {
      setSelectedPointId(nextPoints[0]?.id ?? null);
    }

    if (editingPointId === pointId) {
      setEditingPointId(null);
      setEditingNote("");
    }

    setStatusMessage("Field GPS point deleted.");
  }

  function beginEditNote(point: FounderGpsPoint) {
    setEditingPointId(point.id);
    setEditingNote(point.note);
  }

  function saveEditedNote(pointId: string) {
    const nextPoints = points.map((point) =>
      point.id === pointId
        ? {
            ...point,
            note: editingNote.trim(),
          }
        : point,
    );

    updatePoints(nextPoints);
    setEditingPointId(null);
    setEditingNote("");
    setStatusMessage("Point note updated.");
  }

  function handleClearAllPoints() {
    if (points.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      "Clear all Founder GPS saved points from this browser?",
    );

    if (!confirmed) {
      return;
    }

    updatePoints([]);
    setSelectedPointId(null);
    setEditingPointId(null);
    setEditingNote("");
    setStatusMessage("All Founder GPS points cleared.");
  }

  function handleExportCsv() {
    downloadTextFile("sabahlot-founder-gps-points.csv", "text/csv", buildCsv(points));
  }

  function handleExportKml() {
    downloadTextFile(
      "sabahlot-founder-gps-points.kml",
      "application/vnd.google-earth.kml+xml",
      buildKml(points, sessionName),
    );
  }

  function handleExportGeoJson() {
    downloadTextFile(
      "sabahlot-founder-gps-points.geojson",
      "application/geo+json",
      buildGeoJson(points, sessionName),
    );
  }

  function handlePrintPlan() {
    const printWindow = window.open("", "_blank");

    if (!printWindow) {
      setGpsStatus("Error");
      setStatusMessage("Print window was blocked by the browser.");
      return;
    }

    printWindow.document.write(buildPlanHtml(points, sessionName));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
  }

  return (
    <section className="sl-field-gps-stack" aria-label="Founder GPS Handheld Mode">
      <div className="sl-field-gps-panel">
        <button
          type="button"
          className="sl-field-gps-toggle"
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? "Close Founder GPS" : "Founder GPS Handheld Mode"}
        </button>

        {isOpen && (
          <div className="sl-field-gps-card">
            <header className="sl-field-gps-heading">
              <div>
                <span>Founder GPS Handheld Mode</span>
                <p className="sl-field-gps-note">
                  Internal founder field testing only. Not for Public Alpha users.
                </p>
              </div>
              <strong className="sl-field-gps-count">{points.length}</strong>
            </header>

            <p className="sl-field-gps-warning">{DISCLAIMER}</p>

            <div className="sl-field-gps-section">
              <label className="sl-field-gps-label">
                <span>Session name</span>
                <input
                  value={sessionName}
                  onChange={(event) => updateSessionName(event.target.value)}
                  placeholder={DEFAULT_SESSION_NAME}
                />
              </label>

              <div className="sl-field-gps-session">
                <span>Total points</span>
                <strong>{points.length}</strong>
                <span>Last updated</span>
                <strong>{formatDateTime(lastUpdated)}</strong>
                <small>Saved in this browser only.</small>
              </div>
            </div>

            <div className="sl-field-gps-grid" aria-live="polite">
              <span>GPS status</span>
              <strong>{gpsStatus}</strong>

              <span>Latitude</span>
              <strong>
                {currentPosition
                  ? formatCoordinate(currentPosition.latitude)
                  : "Not captured"}
              </strong>

              <span>Longitude</span>
              <strong>
                {currentPosition
                  ? formatCoordinate(currentPosition.longitude)
                  : "Not captured"}
              </strong>

              <span>Accuracy</span>
              <strong>{formatAccuracy(currentPosition?.accuracy ?? null)}</strong>

              <span>Last GPS time</span>
              <strong>{formatDateTime(currentPosition?.capturedAt ?? null)}</strong>
            </div>

            {permissionError && (
              <p className="sl-field-gps-error">{permissionError}</p>
            )}

            <p className="sl-field-gps-note">{statusMessage}</p>

            <div className="sl-field-gps-section">
              <label className="sl-field-gps-label">
                <span>Point category</span>
                <select
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as FounderGpsCategory)
                  }
                >
                  {categoryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="sl-field-gps-label">
                <span>Short note for next point</span>
                <textarea
                  value={note}
                  onChange={handleNoteChange}
                  placeholder="Example: road edge, gate, old peg area..."
                  maxLength={180}
                />
              </label>

              <div className="sl-field-gps-actions">
                <button
                  type="button"
                  className="sl-field-gps-primary"
                  onClick={handleMarkCurrentLocation}
                  disabled={gpsStatus === "Capturing"}
                >
                  {gpsStatus === "Capturing" ? "Capturing..." : "Mark Point"}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshCurrentLocation}
                  disabled={gpsStatus === "Capturing"}
                >
                  Refresh GPS
                </button>
                <button
                  type="button"
                  onClick={handlePrintPlan}
                >
                  Print Plan
                </button>
              </div>
            </div>

            <div className="sl-field-gps-export-row">
              <button type="button" onClick={handleExportCsv} disabled={points.length === 0}>
                CSV
              </button>
              <button type="button" onClick={handleExportKml} disabled={points.length === 0}>
                KML
              </button>
              <button
                type="button"
                onClick={handleExportGeoJson}
                disabled={points.length === 0}
              >
                GeoJSON
              </button>
              <button
                type="button"
                className="sl-field-gps-danger"
                onClick={handleClearAllPoints}
                disabled={points.length === 0}
              >
                Clear All
              </button>
            </div>

            {selectedPoint && (
              <div className="sl-field-gps-navigate">
                <div className="sl-field-gps-status-row">
                  <strong>Navigate to point</strong>
                  <span>
                    {selectedPoint.pointId} - {selectedPoint.category}
                  </span>
                </div>

                <div className="sl-field-gps-grid">
                  <span>Approx. distance</span>
                  <strong>
                    {navigationInfo
                      ? formatDistance(navigationInfo.distanceMeters)
                      : "Refresh GPS first"}
                  </strong>

                  <span>Approx. bearing</span>
                  <strong>
                    {navigationInfo
                      ? `${navigationInfo.bearingDegrees.toFixed(0)} deg`
                      : "Not available"}
                  </strong>

                  <span>Direction</span>
                  <strong>{navigationInfo ? navigationInfo.direction : "Not available"}</strong>
                </div>
              </div>
            )}

            <div className="sl-field-gps-section">
              <div className="sl-field-gps-status-row">
                <strong>Saved points</strong>
                <span>{selectedPoint ? `Selected ${selectedPoint.pointId}` : "None selected"}</span>
              </div>

              <label className="sl-field-gps-label">
                <span>Search / select point</span>
                <input
                  value={pointSearch}
                  onChange={(event) => setPointSearch(event.target.value)}
                  placeholder="Search point ID, category or note"
                />
              </label>

              {points.length === 0 ? (
                <p className="sl-field-gps-note">
                  No founder test points saved yet.
                </p>
              ) : visiblePoints.length === 0 ? (
                <p className="sl-field-gps-note">
                  No saved points match this search.
                </p>
              ) : (
                <div className="sl-field-gps-point-list">
                  {visiblePoints.map((point) => (
                    <article
                      key={point.id}
                      className={
                        point.id === selectedPoint?.id
                          ? "sl-field-gps-point is-selected"
                          : "sl-field-gps-point"
                      }
                    >
                      <div className="sl-field-gps-point-main">
                        <div className="sl-field-gps-point-title">
                          <strong>{point.pointId}</strong>
                          <span>{point.category}</span>
                        </div>
                        {point.note && <small>{point.note}</small>}
                        <span>
                          {formatCoordinate(point.latitude)},{" "}
                          {formatCoordinate(point.longitude)}
                        </span>
                        <small>
                          {formatAccuracy(point.accuracy)} -{" "}
                          {formatDateTime(point.createdAt)}
                        </small>
                      </div>

                      {editingPointId === point.id ? (
                        <div className="sl-field-gps-edit-note">
                          <textarea
                            value={editingNote}
                            onChange={(event) => setEditingNote(event.target.value)}
                            maxLength={180}
                          />
                          <button type="button" onClick={() => saveEditedNote(point.id)}>
                            Save Note
                          </button>
                        </div>
                      ) : (
                        <div className="sl-field-gps-point-actions">
                          <button type="button" onClick={() => handleSelectPoint(point)}>
                            Select
                          </button>
                          <button type="button" onClick={() => beginEditNote(point)}>
                            Edit Note
                          </button>
                          <button
                            type="button"
                            className="sl-field-gps-danger"
                            onClick={() => handleDeletePoint(point.id)}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <p className="sl-field-gps-disclaimer">
              Coordinates, distance and bearing are approximate field references only.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
