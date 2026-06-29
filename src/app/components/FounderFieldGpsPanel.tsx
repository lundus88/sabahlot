"use client";

import {
  type ChangeEvent,
  useMemo,
  useState,
} from "react";

interface FounderGpsPoint {
  id: string;
  pointId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  createdAt: string;
  note: string;
}

interface CurrentPosition {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
}

const STORAGE_KEY = "sabahlot-founder-field-gps-test-v1";
const EARTH_RADIUS_METERS = 6371008.8;
const DISCLAIMER =
  "Field GPS ini adalah untuk rujukan awal dan ujian lapangan sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan, bukan pengesahan koordinat sah, dan bukan pengganti juruukur berlesen.";

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

    return parsed.filter(isFounderGpsPoint);
  } catch {
    return [];
  }
}

function savePoints(points: FounderGpsPoint[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(points),
  );
}

function isFounderGpsPoint(value: unknown): value is FounderGpsPoint {
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

  return (
    EARTH_RADIUS_METERS *
    2 *
    Math.atan2(
      Math.sqrt(a),
      Math.sqrt(1 - a),
    )
  );
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

  const y =
    Math.sin(lngDelta) *
    Math.cos(endLat);
  const x =
    Math.cos(startLat) *
      Math.sin(endLat) -
    Math.sin(startLat) *
      Math.cos(endLat) *
      Math.cos(lngDelta);

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

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-MY",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return value.replace(
    /[&<>"']/g,
    (character) => replacements[character],
  );
}

function focusMapToPoint(point: FounderGpsPoint) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(
      "sabahlot:find-coordinate",
      {
        detail: {
          latitude: point.latitude,
          longitude: point.longitude,
          label: point.pointId,
          note: point.note,
        },
      },
    ),
  );
}

function buildPlanHtml(points: FounderGpsPoint[]): string {
  const generatedAt = formatDateTime(new Date().toISOString());
  const rows = points
    .map(
      (point) => `
        <tr>
          <td>${escapeHtml(point.pointId)}</td>
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
        <title>Preliminary Field Point Plan</title>
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
            margin: 0 0 14px;
            color: #475569;
            font-size: 12px;
            line-height: 1.45;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
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
        <h1>Preliminary Field Point Plan</h1>
        <p>SabahLot Founder Field GPS Test - internal founder reference only</p>
        <p>Generated: ${escapeHtml(generatedAt)}</p>
        <div class="warning">${escapeHtml(DISCLAIMER)}</div>
        <table>
          <thead>
            <tr>
              <th>Point ID</th>
              <th>Latitude</th>
              <th>Longitude</th>
              <th>Accuracy</th>
              <th>Date/time</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            ${
              rows ||
              '<tr><td colspan="6">No field GPS points saved.</td></tr>'
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
  const [currentPosition, setCurrentPosition] =
    useState<CurrentPosition | null>(null);
  const [status, setStatus] = useState("Ready for internal founder field test.");
  const [isLocating, setIsLocating] = useState(false);

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

  function updatePoints(nextPoints: FounderGpsPoint[]) {
    setPoints(nextPoints);
    savePoints(nextPoints);
  }

  function handleGeolocationError(error: GeolocationPositionError) {
    if (error.code === error.PERMISSION_DENIED) {
      setStatus("Location permission denied.");
      return;
    }

    if (error.code === error.TIMEOUT) {
      setStatus("GPS request timed out. Try again outdoors.");
      return;
    }

    setStatus("Current GPS location is unavailable.");
  }

  function requestCurrentPosition(
    onSuccess: (position: GeolocationPosition) => void,
  ) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatus("Location services are not supported on this browser.");
      return;
    }

    setIsLocating(true);
    setStatus("Requesting phone GPS location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
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
        setIsLocating(false);
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
      };
      const nextPoints = [point, ...points];

      updatePoints(nextPoints);
      setSelectedPointId(point.id);
      setNote("");
      setStatus(`${point.pointId} saved to this device.`);
      focusMapToPoint(point);
    });
  }

  function handleRefreshCurrentLocation() {
    requestCurrentPosition(() => {
      setStatus("Current location refreshed for navigation estimate.");
    });
  }

  function handleSelectPoint(point: FounderGpsPoint) {
    setSelectedPointId(point.id);
    setStatus(`${point.pointId} selected.`);
    focusMapToPoint(point);
  }

  function handleDeletePoint(pointId: string) {
    const nextPoints = points.filter((point) => point.id !== pointId);

    updatePoints(nextPoints);

    if (selectedPointId === pointId) {
      setSelectedPointId(nextPoints[0]?.id ?? null);
    }

    setStatus("Field GPS point deleted.");
  }

  function handleNoteChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setNote(event.target.value);
  }

  function handlePrintPlan() {
    const printWindow = window.open(
      "",
      "_blank",
    );

    if (!printWindow) {
      setStatus("Print window was blocked by the browser.");
      return;
    }

    printWindow.document.write(buildPlanHtml(points));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <section className="sl-field-gps-stack" aria-label="Founder Field GPS Test">
      <div className="sl-field-gps-panel">
        <button
          type="button"
          className="sl-field-gps-toggle"
          onClick={() => setIsOpen((value) => !value)}
        >
          {isOpen ? "Close Founder GPS" : "Founder Field GPS Test"}
        </button>

        {isOpen && (
          <div className="sl-field-gps-card">
            <header className="sl-field-gps-heading">
              <div>
                <span>Founder Field GPS Test</span>
                <p className="sl-field-gps-note">
                  Internal founder field testing only. Not for Public Alpha users.
                </p>
              </div>
              <strong className="sl-field-gps-count">{points.length}</strong>
            </header>

            <p className="sl-field-gps-warning">{DISCLAIMER}</p>

            <div className="sl-field-gps-section">
              <label className="sl-field-gps-label">
                <span>Short note for next point</span>
                <textarea
                  value={note}
                  onChange={handleNoteChange}
                  placeholder="Example: road edge, gate, old peg area..."
                  maxLength={160}
                />
              </label>

              <div className="sl-field-gps-actions">
                <button
                  type="button"
                  className="sl-field-gps-primary"
                  onClick={handleMarkCurrentLocation}
                  disabled={isLocating}
                >
                  {isLocating ? "Locating..." : "Mark GPS"}
                </button>
                <button
                  type="button"
                  onClick={handleRefreshCurrentLocation}
                  disabled={isLocating}
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

            <div className="sl-field-gps-grid" aria-live="polite">
              <span>Status</span>
              <strong>{status}</strong>

              <span>Current GPS</span>
              <strong>
                {currentPosition
                  ? `${formatCoordinate(currentPosition.latitude)}, ${formatCoordinate(
                      currentPosition.longitude,
                    )}`
                  : "Not captured"}
              </strong>

              <span>Accuracy</span>
              <strong>{formatAccuracy(currentPosition?.accuracy ?? null)}</strong>
            </div>

            <div className="sl-field-gps-section">
              <div className="sl-field-gps-status-row">
                <strong>Saved points</strong>
                <span>{selectedPoint ? selectedPoint.pointId : "None selected"}</span>
              </div>

              {points.length === 0 ? (
                <p className="sl-field-gps-note">
                  No founder test points saved yet.
                </p>
              ) : (
                <div className="sl-field-gps-point-list">
                  {points.map((point) => (
                    <article
                      key={point.id}
                      className={
                        point.id === selectedPoint?.id
                          ? "sl-field-gps-point is-selected"
                          : "sl-field-gps-point"
                      }
                    >
                      <button
                        type="button"
                        className="sl-field-gps-point-main"
                        onClick={() => handleSelectPoint(point)}
                      >
                        <strong>{point.pointId}</strong>
                        <span>
                          {formatCoordinate(point.latitude)},{" "}
                          {formatCoordinate(point.longitude)}
                        </span>
                        <small>
                          {formatAccuracy(point.accuracy)} -{" "}
                          {formatDateTime(point.createdAt)}
                        </small>
                        {point.note && <small>{point.note}</small>}
                      </button>

                      <div className="sl-field-gps-point-actions">
                        <button
                          type="button"
                          onClick={() => handleSelectPoint(point)}
                        >
                          Focus
                        </button>
                        <button
                          type="button"
                          className="sl-field-gps-danger"
                          onClick={() => handleDeletePoint(point.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            {selectedPoint && (
              <div className="sl-field-gps-grid">
                <span>Selected</span>
                <strong>{selectedPoint.pointId}</strong>

                <span>Distance</span>
                <strong>
                  {navigationInfo
                    ? formatDistance(navigationInfo.distanceMeters)
                    : "Refresh GPS first"}
                </strong>

                <span>Direction</span>
                <strong>
                  {navigationInfo
                    ? `${navigationInfo.direction} (${navigationInfo.bearingDegrees.toFixed(
                        0,
                      )} deg)`
                    : "Not available"}
                </strong>
              </div>
            )}

            <p className="sl-field-gps-disclaimer">
              Data is stored only in this browser localStorage for now.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
