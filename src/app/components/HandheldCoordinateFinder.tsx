"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SavedPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  source: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseCoordinateInput(input: string) {
  const cleaned = input
    .trim()
    .replace(/[，]/g, ",")
    .replace(/\s+/g, " ");

  const parts = cleaned.includes(",")
    ? cleaned.split(",").map((item) => item.trim())
    : cleaned.split(" ").map((item) => item.trim());

  if (parts.length < 2) return null;

  const lat = Number(parts[0]);
  const lng = Number(parts[1]);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

function collectPointsFromLocalStorage() {
  const results: SavedPoint[] = [];

  const visit = (value: unknown, source: string) => {
    if (!value) return;

    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, source));
      return;
    }

    if (typeof value !== "object") return;

    const record = value as Record<string, unknown>;

    const lat =
      toNumber(record.latitude) ??
      toNumber(record.lat) ??
      toNumber(record.y);

    const lng =
      toNumber(record.longitude) ??
      toNumber(record.lng) ??
      toNumber(record.lon) ??
      toNumber(record.x);

    if (lat === null || lng === null) {
      Object.values(record).forEach((nested) => visit(nested, source));
      return;
    }

    const rawId =
      record.id ??
      record.pointId ??
      record.point_id ??
      record.name ??
      record.label ??
      `Point ${results.length + 1}`;

    const id = String(rawId);

    results.push({
      id,
      lat,
      lng,
      label: `${id} (${lat.toFixed(7)}, ${lng.toFixed(7)})`,
      source,
    });
  };

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;

      const raw = window.localStorage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        visit(parsed, key);
      } catch {
        // Ignore non-JSON local storage value.
      }
    }
  } catch {
    return results;
  }

  return results.slice(0, 200);
}

function goToCoordinate(lat: number, lng: number, label: string) {
  window.dispatchEvent(
    new CustomEvent("sabahlot:goto-coordinate", {
      detail: {
        lat,
        lng,
        label,
        zoom: 18,
      },
    })
  );
}

function HandheldCoordinateFinder() {
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Key-in coordinate or find saved point ID.");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setReady(true);
  }, []);

  const savedPoints = useMemo(() => {
    if (!ready) return [];
    return collectPointsFromLocalStorage();
  }, [ready, refreshKey]);

  const handleGo = () => {
    const value = query.trim();

    if (!value) {
      setMessage("Please enter Point ID or coordinate.");
      return;
    }

    const coordinate = parseCoordinateInput(value);

    if (coordinate) {
      goToCoordinate(
        coordinate.lat,
        coordinate.lng,
        `Key-in coordinate: ${coordinate.lat.toFixed(7)}, ${coordinate.lng.toFixed(7)}`
      );
      setMessage("Map zoomed to key-in coordinate.");
      setIsOpen(false);
      return;
    }

    const found = savedPoints.find(
      (point) => point.id.toLowerCase() === value.toLowerCase()
    );

    if (found) {
      goToCoordinate(found.lat, found.lng, `Find Point: ${found.label}`);
      setMessage(`Map zoomed to ${found.id}.`);
      setIsOpen(false);
      return;
    }

    setMessage("Point not found. Try P1, P2 or key-in latitude, longitude.");
  };

  const handleCurrentGps = () => {
    if (!navigator.geolocation) {
      setMessage("GPS is not supported by this browser.");
      return;
    }

    setMessage("Capturing current GPS...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy =
          typeof position.coords.accuracy === "number"
            ? ` ±${position.coords.accuracy.toFixed(1)}m`
            : "";

        goToCoordinate(lat, lng, `Current GPS${accuracy}`);
        setMessage("Map zoomed to current GPS.");
        setIsOpen(false);
      },
      (error) => {
        setMessage(error.message || "Failed to capture current GPS.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 2000,
        timeout: 20000,
      }
    );
  };

  if (!ready) return null;

  return createPortal(
    <>
      {!isOpen ? (
        <button
          type="button"
          className="sl-hh-find-fab"
          onClick={() => {
            setRefreshKey((current) => current + 1);
            setIsOpen(true);
          }}
          aria-label="Find Point or Key-in Coordinate"
        >
          <span className="sl-hh-find-fab-icon">⌖</span>
          <span className="sl-hh-find-fab-text">Find</span>
        </button>
      ) : null}

      {isOpen ? (
        <section className="sl-hh-find-panel" aria-label="Find Point and Coordinate">
          <div className="sl-hh-find-header">
            <div>
              <h2>Find Point</h2>
              <p>Search saved point or key-in WGS84 coordinate.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close Find Point">
              ×
            </button>
          </div>

          <div className="sl-hh-find-body">
            <label>
              Point ID / Coordinate
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Example: P1 or 5.980400, 116.073500"
              />
            </label>

            <div className="sl-hh-find-actions">
              <button type="button" className="is-primary" onClick={handleGo}>
                Go
              </button>
              <button type="button" onClick={handleCurrentGps}>
                Current GPS
              </button>
            </div>

            <p className="sl-hh-find-message">{message}</p>

            <div className="sl-hh-find-list">
              <h3>Saved Points ({savedPoints.length})</h3>
              {savedPoints.length === 0 ? (
                <p>No saved GPS point found in this browser yet.</p>
              ) : (
                savedPoints.slice(0, 20).map((point) => (
                  <button
                    key={`${point.source}-${point.id}-${point.lat}-${point.lng}`}
                    type="button"
                    onClick={() => {
                      goToCoordinate(point.lat, point.lng, `Find Point: ${point.label}`);
                      setMessage(`Map zoomed to ${point.id}.`);
                      setIsOpen(false);
                    }}
                  >
                    <strong>{point.id}</strong>
                    <span>
                      {point.lat.toFixed(7)}, {point.lng.toFixed(7)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      ) : null}
    </>,
    document.body
  );
}

export default HandheldCoordinateFinder;
