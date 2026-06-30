"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type SavedPoint = {
  id: string;
  lat: number;
  lng: number;
  source: string;
};

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseCoordinateInput(input: string) {
  const cleaned = input.trim().replace(/[，]/g, ",").replace(/\s+/g, " ");

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

function collectSavedPoints() {
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
      `P${results.length + 1}`;

    results.push({
      id: String(rawId),
      lat,
      lng,
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
        visit(JSON.parse(raw), key);
      } catch {
        // Ignore non JSON localStorage values.
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
  const [message, setMessage] = useState("Masukkan Point ID atau koordinat WGS84.");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setReady(true);
  }, []);

  const savedPoints = useMemo(() => {
    if (!ready) return [];
    return collectSavedPoints();
  }, [ready, refreshKey]);

  const handleGo = () => {
    const value = query.trim();

    if (!value) {
      setMessage("Sila masukkan Point ID atau koordinat.");
      return;
    }

    const coordinate = parseCoordinateInput(value);

    if (coordinate) {
      goToCoordinate(
        coordinate.lat,
        coordinate.lng,
        `Key-in coordinate: ${coordinate.lat.toFixed(7)}, ${coordinate.lng.toFixed(7)}`
      );
      setMessage("Peta zoom ke koordinat yang dimasukkan.");
      setIsOpen(false);
      return;
    }

    const found = savedPoints.find(
      (point) => point.id.toLowerCase() === value.toLowerCase()
    );

    if (found) {
      goToCoordinate(found.lat, found.lng, `Find Point: ${found.id}`);
      setMessage(`Peta zoom ke ${found.id}.`);
      setIsOpen(false);
      return;
    }

    setMessage("Point tidak dijumpai. Cuba P1, P2 atau key-in lat, lng.");
  };

  const handleCurrentGps = () => {
    if (!navigator.geolocation) {
      setMessage("GPS tidak disokong oleh browser ini.");
      return;
    }

    setMessage("Mendapatkan lokasi GPS semasa...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        goToCoordinate(lat, lng, "Current GPS");
        setMessage("Peta zoom ke lokasi GPS semasa.");
        setIsOpen(false);
      },
      (error) => {
        setMessage(error.message || "Gagal mendapatkan lokasi GPS.");
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
          aria-label="Find Point and Key-in Coordinate"
        >
          <span className="sl-hh-find-fab-icon">⌖</span>
          <span className="sl-hh-find-fab-text">Find</span>
          <span className="sl-hh-find-fab-subtext">Key-in</span>
        </button>
      ) : null}

      {isOpen ? (
        <section className="sl-hh-find-panel" aria-label="Find Point and Key-in Coordinate">
          <div className="sl-hh-find-header">
            <div>
              <h2>Find Point / Key-in</h2>
              <p>Point ID atau koordinat WGS84.</p>
            </div>
            <button type="button" onClick={() => setIsOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          <div className="sl-hh-find-body">
            <label>
              Point ID / Coordinate
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Contoh: P1 atau 5.980400, 116.073500"
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
                <p>Tiada saved point dijumpai dalam browser ini.</p>
              ) : (
                savedPoints.slice(0, 20).map((point) => (
                  <button
                    key={`${point.source}-${point.id}-${point.lat}-${point.lng}`}
                    type="button"
                    onClick={() => {
                      goToCoordinate(point.lat, point.lng, `Find Point: ${point.id}`);
                      setMessage(`Peta zoom ke ${point.id}.`);
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
