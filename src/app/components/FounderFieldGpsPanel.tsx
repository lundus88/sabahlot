"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type GpsStatus = "Ready" | "Capturing" | "Captured" | "Tracking" | "Error";

type CurrentGps = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
};

type FieldPoint = {
  id: string;
  category: string;
  note: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
};

const STORAGE_KEY = "sabahlot-founder-gps-points-v2";

const POINT_CATEGORIES = [
  "Boundary point",
  "Access point",
  "Road edge",
  "River / drain",
  "Building / house",
  "Old peg / marker",
  "Photo location",
  "Other",
];

function formatTimestamp(date = new Date()) {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function formatCoord(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not captured";
  return value.toFixed(7);
}

function formatAccuracy(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not available";
  return `± ${value.toFixed(1)} m`;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function distanceMeters(a: CurrentGps, b: FieldPoint) {
  const earthRadius = 6371000;
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function bearingDegrees(a: CurrentGps, b: FieldPoint) {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const dLon = toRadians(b.longitude - a.longitude);

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function bearingToDirection(bearing: number) {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(bearing / 45) % 8];
}

function escapeCsv(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

function FounderFieldGpsPanel() {
  const [portalReady, setPortalReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>("Ready");
  const [gpsMessage, setGpsMessage] = useState("Ready for founder GPS field test.");
  const [currentGps, setCurrentGps] = useState<CurrentGps | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [category, setCategory] = useState(POINT_CATEGORIES[0]);
  const [note, setNote] = useState("");
  const [points, setPoints] = useState<FieldPoint[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    setPortalReady(true);

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FieldPoint[];
        if (Array.isArray(parsed)) setPoints(parsed);
      }
    } catch {
      setGpsMessage("Saved points could not be loaded.");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
    } catch {
      setGpsMessage("Points could not be saved in this browser.");
    }
  }, [points]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const selectedPoint = useMemo(
    () => points.find((point) => point.id === selectedPointId) ?? null,
    [points, selectedPointId]
  );

  const navigation = useMemo(() => {
    if (!currentGps || !selectedPoint) return null;

    const distance = distanceMeters(currentGps, selectedPoint);
    const bearing = bearingDegrees(currentGps, selectedPoint);

    return {
      distance,
      bearing,
      direction: bearingToDirection(bearing),
    };
  }, [currentGps, selectedPoint]);

  const handleGpsSuccess = (position: GeolocationPosition, mode: "Captured" | "Tracking") => {
    const nextGps: CurrentGps = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy:
        typeof position.coords.accuracy === "number"
          ? position.coords.accuracy
          : null,
      timestamp: formatTimestamp(),
    };

    setCurrentGps(nextGps);
    setGpsStatus(mode);
    setGpsMessage(
      mode === "Tracking"
        ? "Tracking current position for approximate field navigation."
        : "Current GPS captured."
    );
  };

  const handleGpsError = (error: GeolocationPositionError) => {
    setGpsStatus("Error");
    setGpsMessage(error.message || "Gagal mendapatkan lokasi GPS.");
    setIsTracking(false);
  };

  const refreshGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Error");
      setGpsMessage("GPS tidak disokong oleh browser ini.");
      return;
    }

    setGpsStatus("Capturing");
    setGpsMessage("Capturing current GPS position...");

    navigator.geolocation.getCurrentPosition(
      (position) => handleGpsSuccess(position, "Captured"),
      handleGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setGpsStatus("Error");
      setGpsMessage("GPS tidak disokong oleh browser ini.");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setIsTracking(true);
    setGpsStatus("Tracking");
    setGpsMessage("Tracking current position...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => handleGpsSuccess(position, "Tracking"),
      handleGpsError,
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 15000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    setIsTracking(false);
    setGpsStatus(currentGps ? "Captured" : "Ready");
    setGpsMessage("GPS tracking stopped.");
  };

  const markPoint = () => {
    if (!currentGps) {
      setGpsStatus("Error");
      setGpsMessage("Press Refresh GPS or Track My Position before marking a point.");
      return;
    }

    const nextPoint: FieldPoint = {
      id: `P${points.length + 1}`,
      category,
      note: note.trim(),
      latitude: currentGps.latitude,
      longitude: currentGps.longitude,
      accuracy: currentGps.accuracy,
      timestamp: formatTimestamp(),
    };

    setPoints((current) => [...current, nextPoint]);
    setSelectedPointId(nextPoint.id);
    setNote("");
    setGpsMessage(`${nextPoint.id} saved for preliminary field reference.`);
  };

  const deletePoint = (pointId: string) => {
    const confirmed = window.confirm(`Delete ${pointId}?`);
    if (!confirmed) return;

    setPoints((current) => current.filter((point) => point.id !== pointId));
    if (selectedPointId === pointId) setSelectedPointId(null);
  };

  const clearPoints = () => {
    if (points.length === 0) return;
    const confirmed = window.confirm("Clear all saved GPS points?");
    if (!confirmed) return;

    setPoints([]);
    setSelectedPointId(null);
    setGpsMessage("All points cleared.");
  };

  const exportCsv = () => {
    const header = [
      "Point ID",
      "Category",
      "Note",
      "Latitude",
      "Longitude",
      "Accuracy",
      "Timestamp",
    ];

    const rows = points.map((point) => [
      point.id,
      point.category,
      point.note,
      point.latitude,
      point.longitude,
      point.accuracy ?? "",
      point.timestamp,
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((value) => escapeCsv(value)).join(","))
      .join("\n");

    downloadTextFile("sabahlot-founder-gps-points.csv", csv, "text/csv;charset=utf-8");
  };

  const printPlan = () => {
    const rows =
      points.length === 0
        ? "<tr><td colspan='7'>No saved points.</td></tr>"
        : points
            .map(
              (point) => `<tr>
<td>${point.id}</td>
<td>${point.category}</td>
<td>${point.note || "-"}</td>
<td>${point.latitude.toFixed(7)}</td>
<td>${point.longitude.toFixed(7)}</td>
<td>${formatAccuracy(point.accuracy)}</td>
<td>${point.timestamp}</td>
</tr>`
            )
            .join("");

    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setGpsMessage("Popup blocked. Please allow popup to print plan.");
      return;
    }

    printWindow.document.write(`<!doctype html>
<html>
<head>
  <title>SabahLot Preliminary Field Point Plan</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
    h1 { margin-bottom: 4px; }
    .note { border: 1px solid #f59e0b; background: #fff7ed; padding: 12px; border-radius: 10px; margin: 16px 0; color: #7c2d12; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <h1>SabahLot Preliminary Field Point Plan</h1>
  <p><strong>Date:</strong> ${formatTimestamp()}</p>
  <div class="note">
    Field GPS ini adalah untuk rujukan awal dan ujian lapangan sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan, bukan pengesahan koordinat sah, dan bukan pengganti juruukur berlesen.
  </div>
  <table>
    <thead>
      <tr>
        <th>Point</th>
        <th>Category</th>
        <th>Note</th>
        <th>Latitude</th>
        <th>Longitude</th>
        <th>Accuracy</th>
        <th>Timestamp</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`);

    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (!portalReady) return null;

  return (
    <>
      {!isOpen
        ? createPortal(
            <button
              type="button"
              className="sl-handheld-gps-fab"
              aria-label="Open Founder GPS Handheld"
              onClick={() => setIsOpen(true)}
            >
              <span className="sl-handheld-gps-fab-icon">📍</span>
              <span className="sl-handheld-gps-fab-text">GPS</span>
              <span className="sl-handheld-gps-fab-count">{points.length}</span>
            </button>,
            document.body
          )
        : null}

      {isOpen
        ? createPortal(
            <section className="sl-handheld-gps-panel" aria-label="Founder GPS Handheld">
              <div className="sl-handheld-gps-header">
                <div>
                  <h2>Founder GPS</h2>
                  <p>Internal field testing only. Preliminary reference.</p>
                </div>
                <button
                  type="button"
                  className="sl-handheld-gps-close"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close Founder GPS"
                >
                  ×
                </button>
              </div>

              <div className="sl-handheld-gps-body">
                <div className="sl-handheld-gps-warning">
                  Field GPS ini adalah untuk rujukan awal sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan dan bukan pengesahan koordinat sah.
                </div>

                <div className="sl-handheld-gps-card">
                  <div>
                    <span>Status</span>
                    <strong>{gpsStatus}</strong>
                  </div>
                  <div>
                    <span>Latitude</span>
                    <strong>{formatCoord(currentGps?.latitude)}</strong>
                  </div>
                  <div>
                    <span>Longitude</span>
                    <strong>{formatCoord(currentGps?.longitude)}</strong>
                  </div>
                  <div>
                    <span>Accuracy</span>
                    <strong>{formatAccuracy(currentGps?.accuracy)}</strong>
                  </div>
                  <div>
                    <span>Last GPS</span>
                    <strong>{currentGps?.timestamp ?? "Not captured"}</strong>
                  </div>
                </div>

                <p className="sl-handheld-gps-message">{gpsMessage}</p>

                <div className="sl-handheld-gps-actions">
                  <button type="button" onClick={refreshGps}>
                    Refresh GPS
                  </button>
                  <button
                    type="button"
                    className={isTracking ? "is-danger" : "is-primary"}
                    onClick={isTracking ? stopTracking : startTracking}
                  >
                    {isTracking ? "Stop Tracking" : "Track My Position"}
                  </button>
                </div>

                <label className="sl-handheld-gps-label">
                  Point category
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {POINT_CATEGORIES.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="sl-handheld-gps-label">
                  Short note
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Example: road edge, old peg, gate..."
                  />
                </label>

                <div className="sl-handheld-gps-actions">
                  <button type="button" className="is-primary" onClick={markPoint}>
                    Mark Point
                  </button>
                  <button type="button" onClick={printPlan}>
                    Print Plan
                  </button>
                </div>

                {selectedPoint && navigation ? (
                  <div className="sl-handheld-gps-card">
                    <div>
                      <span>Selected</span>
                      <strong>{selectedPoint.id}</strong>
                    </div>
                    <div>
                      <span>Distance</span>
                      <strong>{navigation.distance.toFixed(1)} m</strong>
                    </div>
                    <div>
                      <span>Bearing</span>
                      <strong>
                        {navigation.bearing.toFixed(0)}° / {navigation.direction}
                      </strong>
                    </div>
                  </div>
                ) : null}

                <div className="sl-handheld-gps-list">
                  <h3>Saved Points ({points.length})</h3>
                  {points.length === 0 ? (
                    <p>No GPS points saved yet.</p>
                  ) : (
                    points.map((point) => (
                      <article
                        key={point.id}
                        className={selectedPointId === point.id ? "is-selected" : ""}
                      >
                        <div>
                          <strong>{point.id}</strong>
                          <span>{point.category}</span>
                        </div>
                        <small>
                          {point.latitude.toFixed(7)}, {point.longitude.toFixed(7)} ·{" "}
                          {formatAccuracy(point.accuracy)}
                        </small>
                        <p>{point.note || "No note"}</p>
                        <div className="sl-handheld-gps-point-actions">
                          <button type="button" onClick={() => setSelectedPointId(point.id)}>
                            Select
                          </button>
                          <button type="button" onClick={() => deletePoint(point.id)}>
                            Delete
                          </button>
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="sl-handheld-gps-actions">
                  <button type="button" onClick={exportCsv} disabled={points.length === 0}>
                    Export CSV
                  </button>
                  <button type="button" className="is-danger" onClick={clearPoints}>
                    Clear Points
                  </button>
                </div>
              </div>
            </section>,
            document.body
          )
        : null}
    </>
  );
}

export { FounderFieldGpsPanel };
export default FounderFieldGpsPanel;
