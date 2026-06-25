"use client";

import {
  useMemo,
  useState,
} from "react";

import {
  parseWgs84Coordinate,
} from "@/lib/coordinate-parser";

import {
  createKeyedCoordinatePoint,
  KEYED_COORDINATE_DISCLAIMER,
} from "@/lib/field-gps";

interface CoordinateFinderProps {
  enabled: boolean;
}

function nextDefaultLabel(): string {
  return `P${new Date().getTime().toString().slice(-4)}`;
}

export default function CoordinateFinder({
  enabled,
}: CoordinateFinderProps) {
  const [
    open,
    setOpen,
  ] = useState(false);
  const [
    input,
    setInput,
  ] = useState("");
  const [
    label,
    setLabel,
  ] = useState("P1");
  const [
    note,
    setNote,
  ] = useState("");
  const [
    message,
    setMessage,
  ] = useState("");

  const result =
    useMemo(
      () =>
        input.trim()
          ? parseWgs84Coordinate(
              input,
            )
          : {
              ok: false,
              error:
                "Enter a WGS84 latitude, longitude coordinate.",
            },
      [input],
    );

  if (!enabled) {
    return null;
  }

  const findPoint = () => {
    if (
      !result.ok ||
      !result.coordinate
    ) {
      setMessage(
        result.error ??
          "Invalid coordinate.",
      );
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:find-coordinate",
        {
          detail: {
            latitude:
              result.coordinate.latitude,
            longitude:
              result.coordinate.longitude,
            label:
              label.trim() ||
              "Keyed coordinate",
          },
        },
      ),
    );

    setMessage(
      navigator.onLine
        ? "Coordinate marker placed as preliminary WGS84 field reference only."
        : "Map background may be unavailable offline. Coordinate marker is still stored as preliminary reference.",
    );
  };

  const clearMarker = () => {
    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:clear-coordinate-marker",
      ),
    );
    setMessage(
      "Coordinate marker cleared.",
    );
  };

  const addAsFieldPoint = () => {
    if (
      !result.ok ||
      !result.coordinate
    ) {
      setMessage(
        result.error ??
          "Invalid coordinate.",
      );
      return;
    }

    const point =
      createKeyedCoordinatePoint(
        result.coordinate.latitude,
        result.coordinate.longitude,
        label.trim() ||
          nextDefaultLabel(),
        note,
      );

    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:add-field-gps-point",
        {
          detail: {
            point,
          },
        },
      ),
    );

    setMessage(
      `${point.label} added as keyed WGS84 coordinate. Preliminary approximate field reference only.`,
    );
  };

  return (
    <section className="sl-field-gps-panel sl-coordinate-finder-panel">
      <button
        type="button"
        className="sl-field-gps-toggle"
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
      >
        Find Coordinate
      </button>

      {open && (
        <div className="sl-field-gps-card">
          <div className="sl-field-gps-heading">
            <span>Find Coordinate</span>
            <strong>WGS84</strong>
          </div>

          <section className="sl-field-gps-section">
            <label className="sl-field-gps-label">
              <span>Enter WGS84 latitude, longitude</span>
              <input
                type="text"
                value={input}
                onChange={(event) =>
                  setInput(
                    event.target.value,
                  )
                }
                placeholder="5.968600, 116.072130"
                autoComplete="off"
              />
            </label>

            <label className="sl-field-gps-label">
              <span>Point label</span>
              <input
                type="text"
                value={label}
                onChange={(event) =>
                  setLabel(
                    event.target.value,
                  )
                }
                placeholder="P1, Corner 1, Access point"
              />
            </label>

            <label className="sl-field-gps-label">
              <span>Optional note</span>
              <textarea
                value={note}
                onChange={(event) =>
                  setNote(
                    event.target.value,
                  )
                }
                rows={3}
                placeholder="Coordinate from WhatsApp"
              />
            </label>
          </section>

          <section className="sl-field-gps-section">
            <div className="sl-field-gps-grid">
              <span>Latitude</span>
              <strong>
                {result.ok &&
                result.coordinate
                  ? result.coordinate.latitude.toFixed(7)
                  : "-"}
              </strong>
              <span>Longitude</span>
              <strong>
                {result.ok &&
                result.coordinate
                  ? result.coordinate.longitude.toFixed(7)
                  : "-"}
              </strong>
              <span>Coordinate system</span>
              <strong>WGS84</strong>
              <span>Validation status</span>
              <strong>
                {result.ok
                  ? result.coordinate?.warnings.length
                    ? "Valid with warning"
                    : "Valid"
                  : result.error}
              </strong>
            </div>

            {result.ok &&
              result.coordinate?.warnings.map(
                (warning) => (
                  <p
                    key={warning}
                    className="sl-field-gps-warning"
                  >
                    {warning}
                  </p>
                ),
              )}
          </section>

          <div className="sl-field-gps-actions">
            <button
              type="button"
              onClick={findPoint}
            >
              Find Point
            </button>
            <button
              type="button"
              onClick={clearMarker}
            >
              Clear Marker
            </button>
            <button
              type="button"
              onClick={addAsFieldPoint}
            >
              Add as Field Point
            </button>
          </div>

          {message && (
            <p className="sl-field-gps-note">
              {message}
            </p>
          )}

          <p className="sl-field-gps-disclaimer">
            Coordinate key-in is preliminary and for field reference only. It is not proof of legal boundary. {KEYED_COORDINATE_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  );
}
