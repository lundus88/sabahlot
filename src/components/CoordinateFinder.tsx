"use client";

import {
  useState,
} from "react";

import {
  parseWgs84Coordinate,
} from "@/lib/coordinate-parser";

import {
  createKeyedCoordinatePoint,
  KEYED_COORDINATE_DISCLAIMER,
} from "@/lib/field-gps";

import {
  saveGpsTargetMemory,
} from "@/utils/gpsTargetMemory";

import type {
  CoordinateParseResult,
} from "@/lib/coordinate.types";

interface CoordinateFinderProps {
  enabled: boolean;
}

function nextDefaultLabel(): string {
  return `P${new Date().getTime().toString().slice(-4)}`;
}

function buildGoogleMapsUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function buildWazeUrl(
  latitude: number,
  longitude: number,
): string {
  return `https://waze.com/ul?ll=${latitude},${longitude}&navigate=yes`;
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
  const [
    parsedResult,
    setParsedResult,
  ] = useState<CoordinateParseResult>({
    ok: false,
    error:
      "Enter a WGS84 latitude, longitude coordinate.",
  });

  if (!enabled) {
    return null;
  }

  const findPoint = () => {
    const result =
      parseWgs84Coordinate(
        input,
      );

    setParsedResult(result);

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
            note:
              note.trim(),
          },
        },
      ),
    );

    saveGpsTargetMemory({
      lat:
        result.coordinate.latitude,
      lng:
        result.coordinate.longitude,
      label:
        label.trim() ||
        "Keyed coordinate",
      source:
        "key-in",
    });

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
    setParsedResult({
      ok: false,
      error:
        "Enter a WGS84 latitude, longitude coordinate.",
    });
    setMessage(
      "Coordinate marker cleared.",
    );
  };

  const addAsFieldPoint = () => {
    const result =
      parsedResult;

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

  const navigationCoordinate =
    parsedResult.ok &&
    parsedResult.coordinate
      ? parsedResult.coordinate
      : null;

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
                  {
                    setInput(
                      event.target.value,
                    );
                    setParsedResult({
                      ok: false,
                      error:
                        "Click Find Point to parse this WGS84 coordinate.",
                    });
                  }
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
                {parsedResult.ok &&
                parsedResult.coordinate
                  ? parsedResult.coordinate.latitude.toFixed(7)
                  : "-"}
              </strong>
              <span>Longitude</span>
              <strong>
                {parsedResult.ok &&
                parsedResult.coordinate
                  ? parsedResult.coordinate.longitude.toFixed(7)
                  : "-"}
              </strong>
              <span>Coordinate system</span>
              <strong>WGS84</strong>
              <span>Validation status</span>
              <strong>
                {parsedResult.ok
                  ? parsedResult.coordinate?.warnings.length
                    ? "Valid with warning"
                    : "Valid"
                  : parsedResult.error}
              </strong>
            </div>

            {parsedResult.ok &&
              parsedResult.coordinate?.warnings.map(
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
              disabled={
                !parsedResult.ok ||
                !parsedResult.coordinate
              }
            >
              Add as Field Point
            </button>
            <a
              className={`sl-field-gps-link-button ${
                navigationCoordinate
                  ? ""
                  : "is-disabled"
              }`}
              href={
                navigationCoordinate
                  ? buildGoogleMapsUrl(
                      navigationCoordinate.latitude,
                      navigationCoordinate.longitude,
                    )
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!navigationCoordinate}
            >
              Google Maps
            </a>
            <a
              className={`sl-field-gps-link-button ${
                navigationCoordinate
                  ? ""
                  : "is-disabled"
              }`}
              href={
                navigationCoordinate
                  ? buildWazeUrl(
                      navigationCoordinate.latitude,
                      navigationCoordinate.longitude,
                    )
                  : undefined
              }
              target="_blank"
              rel="noopener noreferrer"
              aria-disabled={!navigationCoordinate}
            >
              Waze
            </a>
          </div>

          {message && (
            <p className="sl-field-gps-note">
              {message}
            </p>
          )}

          <p className="sl-field-gps-disclaimer">
            {KEYED_COORDINATE_DISCLAIMER}
          </p>
        </div>
      )}
    </section>
  );
}
