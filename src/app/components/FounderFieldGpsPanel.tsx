"use client";

import { useEffect, useRef, useState } from "react";
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
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string;
  note: string;
};

const STORAGE_KEY = "sabahlot-handheld-gps-points-stable-v1";

function formatTime() {
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
}

function formatCoord(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not captured";
  return value.toFixed(7);
}

function formatAccuracy(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "Not available";
  return `± ${value.toFixed(1)} m`;
}

function FounderFieldGpsPanel() {
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<GpsStatus>("Ready");
  const [message, setMessage] = useState("Ready for handheld GPS field test.");
  const [currentGps, setCurrentGps] = useState<CurrentGps | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [note, setNote] = useState("");
  const [points, setPoints] = useState<FieldPoint[]>([]);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    setReady(true);

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FieldPoint[];
        if (Array.isArray(parsed)) setPoints(parsed);
      }
    } catch {
      setMessage("Saved GPS points could not be loaded.");
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(points));
    } catch {
      setMessage("GPS points could not be saved in this browser.");
    }
  }, [points]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const handleSuccess = (position: GeolocationPosition, nextStatus: GpsStatus) => {
    const nextGps: CurrentGps = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy:
        typeof position.coords.accuracy === "number"
          ? position.coords.accuracy
          : null,
      timestamp: formatTime(),
    };

    setCurrentGps(nextGps);
    setStatus(nextStatus);
    setMessage(
      nextStatus === "Tracking"
        ? "Tracking current position for approximate navigation."
        : "Current GPS captured."
    );
  };

  const handleError = (error: GeolocationPositionError) => {
    setStatus("Error");
    setMessage(error.message || "Gagal mendapatkan lokasi GPS.");
    setIsTracking(false);
  };

  const refreshGps = () => {
    if (!navigator.geolocation) {
      setStatus("Error");
      setMessage("GPS tidak disokong oleh browser ini.");
      return;
    }

    setStatus("Capturing");
    setMessage("Capturing current GPS position...");

    navigator.geolocation.getCurrentPosition(
      (position) => handleSuccess(position, "Captured"),
      handleError,
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 15000,
      }
    );
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setStatus("Error");
      setMessage("GPS tidak disokong oleh browser ini.");
      return;
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    setIsTracking(true);
    setStatus("Tracking");
    setMessage("Tracking current position...");

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => handleSuccess(position, "Tracking"),
      handleError,
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
    setStatus(currentGps ? "Captured" : "Ready");
    setMessage("GPS tracking stopped.");
  };

  const markPoint = () => {
    if (!currentGps) {
      setStatus("Error");
      setMessage("Press Refresh GPS or Track My Position before marking a point.");
      return;
    }

    const nextPoint: FieldPoint = {
      id: `P${points.length + 1}`,
      latitude: currentGps.latitude,
      longitude: currentGps.longitude,
      accuracy: currentGps.accuracy,
      timestamp: formatTime(),
      note: note.trim(),
    };

    setPoints((current) => [...current, nextPoint]);
    setNote("");
    setMessage(`${nextPoint.id} saved.`);
  };

  const clearPoints = () => {
    if (points.length === 0) return;
    if (!window.confirm("Clear all saved GPS points?")) return;

    setPoints([]);
    setMessage("All GPS points cleared.");
  };

  const printPlan = () => {
    const rows =
      points.length === 0
        ? "<tr><td colspan='6'>No saved points.</td></tr>"
        : points
            .map(
              (point) => `<tr>
<td>${point.id}</td>
<td>${point.latitude.toFixed(7)}</td>
<td>${point.longitude.toFixed(7)}</td>
<td>${formatAccuracy(point.accuracy)}</td>
<td>${point.timestamp}</td>
<td>${point.note || "-"}</td>
</tr>`
            )
            .join("");

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      setMessage("Popup blocked. Please allow popup to print plan.");
      return;
    }

    win.document.write(`<!doctype html>
<html>
<head>
<title>SabahLot Preliminary GPS Field Plan</title>
<style>
body { font-family: Arial, sans-serif; padding: 24px; color: #111827; }
h1 { margin-bottom: 4px; }
.notice { border: 1px solid #f59e0b; background: #fff7ed; color: #7c2d12; padding: 12px; border-radius: 10px; margin: 16px 0; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
th { background: #f1f5f9; }
</style>
</head>
<body>
<h1>SabahLot Preliminary GPS Field Plan</h1>
<p><strong>Date:</strong> ${formatTime()}</p>
<div class="notice">Field GPS ini adalah untuk rujukan awal sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan dan bukan pengesahan koordinat sah.</div>
<table>
<thead>
<tr>
<th>Point</th>
<th>Latitude</th>
<th>Longitude</th>
<th>Accuracy</th>
<th>Time</th>
<th>Note</th>
</tr>
</thead>
<tbody>${rows}</tbody>
</table>
</body>
</html>`);

    win.document.close();
    win.focus();
    win.print();
  };

  if (!ready) return null;

  return (
    <>
      {!isOpen
        ? createPortal(
            <button
              type="button"
              className="sl-hh-gps-fab"
              onClick={() => setIsOpen(true)}
              aria-label="Open GPS Handheld"
            >
              <span className="sl-hh-gps-fab-icon">📍</span>
              <span className="sl-hh-gps-fab-text">GPS</span>
              <span className="sl-hh-gps-fab-count">{points.length}</span>
            </button>,
            document.body
          )
        : null}

      {isOpen
        ? createPortal(
            <section className="sl-hh-gps-panel" aria-label="GPS Handheld Panel">
              <div className="sl-hh-gps-header">
                <div>
                  <h2>GPS Handheld</h2>
                  <p>Field test / preliminary reference only.</p>
                </div>
                <button type="button" onClick={() => setIsOpen(false)} aria-label="Close GPS">
                  ×
                </button>
              </div>

              <div className="sl-hh-gps-body">
                <div className="sl-hh-gps-warning">
                  Field GPS ini adalah untuk rujukan awal sahaja. Ia bukan kerja ukur rasmi, bukan stakeout sempadan dan bukan pengesahan koordinat sah.
                </div>

                <div className="sl-hh-gps-card">
                  <div><span>Status</span><strong>{status}</strong></div>
                  <div><span>Latitude</span><strong>{formatCoord(currentGps?.latitude)}</strong></div>
                  <div><span>Longitude</span><strong>{formatCoord(currentGps?.longitude)}</strong></div>
                  <div><span>Accuracy</span><strong>{formatAccuracy(currentGps?.accuracy)}</strong></div>
                  <div><span>Last GPS</span><strong>{currentGps?.timestamp ?? "Not captured"}</strong></div>
                </div>

                <p className="sl-hh-gps-message">{message}</p>

                <div className="sl-hh-gps-actions">
                  <button type="button" onClick={refreshGps}>Refresh GPS</button>
                  <button
                    type="button"
                    className={isTracking ? "is-danger" : "is-primary"}
                    onClick={isTracking ? stopTracking : startTracking}
                  >
                    {isTracking ? "Stop Tracking" : "Track My Position"}
                  </button>
                </div>

                <label className="sl-hh-gps-label">
                  Short note
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Example: road edge, old peg, gate..."
                  />
                </label>

                <div className="sl-hh-gps-actions">
                  <button type="button" className="is-primary" onClick={markPoint}>Mark Point</button>
                  <button type="button" onClick={printPlan}>Print Plan</button>
                </div>

                <div className="sl-hh-gps-list">
                  <h3>Saved Points ({points.length})</h3>
                  {points.length === 0 ? (
                    <p>No GPS points saved yet.</p>
                  ) : (
                    points.map((point) => (
                      <article key={point.id}>
                        <strong>{point.id}</strong>
                        <small>
                          {point.latitude.toFixed(7)}, {point.longitude.toFixed(7)} · {formatAccuracy(point.accuracy)}
                        </small>
                        <p>{point.note || "No note"}</p>
                      </article>
                    ))
                  )}
                </div>

                <button type="button" className="sl-hh-gps-clear" onClick={clearPoints}>
                  Clear Points
                </button>
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
