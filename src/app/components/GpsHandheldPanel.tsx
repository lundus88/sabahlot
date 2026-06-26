"use client";

import {
  ChangeEvent,
  useState,
} from "react";

import {
  convertWgs84ToProjection,
  parseManualCoordinate,
} from "@/lib/gps/gps-coordinate";

import {
  buildGpx,
  downloadTextFile,
} from "@/lib/gps/gps-export";

import {
  parseGpsFile,
} from "@/lib/gps/gps-import";

import type {
  GpsCoordinateFormat,
  GpsPoint,
  GpsTrack,
  ParsedGpsFile,
  SabahProjection,
} from "@/lib/gps/gps-types";

interface GpsHandheldPanelProps {
  lotName: string;
  selectedLotPoints: Array<{
    lat: number;
    lng: number;
  }>;
  onGpsImport: (data: ParsedGpsFile) => void;
  onZoomTo: (lat: number, lng: number) => void;
  onUseDeviceGps: () => void;
  isTracking: boolean;
}

export default function GpsHandheldPanel({
  lotName,
  selectedLotPoints,
  onGpsImport,
  onZoomTo,
  onUseDeviceGps,
  isTracking,
}: GpsHandheldPanelProps) {
  const [coordinateText, setCoordinateText] =
    useState("");

  const [coordinateFormat, setCoordinateFormat] =
    useState<GpsCoordinateFormat>("DD");

  const [projection, setProjection] =
    useState<SabahProjection>(
      "TIMBALAI_1948_RSO_BORNEO_M",
    );

  const [message, setMessage] =
    useState("");

  const handleImportGpsFile =
    async (
      event: ChangeEvent<HTMLInputElement>,
    ) => {
      const file =
        event.target.files?.[0];

      if (!file) return;

      try {
        const parsed =
          await parseGpsFile(file);

        onGpsImport(parsed);

        setMessage(
          `Imported ${parsed.waypoints.length} waypoint(s) and ${parsed.tracks.length} track(s).`,
        );
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "GPS import failed.",
        );
      } finally {
        event.target.value = "";
      }
    };

  const handleManualZoom =
    () => {
      try {
        const coordinate =
          parseManualCoordinate(
            coordinateText,
            coordinateFormat,
          );

        const projected =
          convertWgs84ToProjection(
            coordinate.lat,
            coordinate.lng,
            projection,
          );

        onZoomTo(
          coordinate.lat,
          coordinate.lng,
        );

        if (
          projected.easting &&
          projected.northing
        ) {
          setMessage(
            `Zoomed. Approx RSO E ${projected.easting.toFixed(3)}, N ${projected.northing.toFixed(3)}.`,
          );
        } else {
          setMessage(
            "Zoomed to coordinate.",
          );
        }
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Invalid coordinate.",
        );
      }
    };

  const handleExportGpx =
    () => {
      if (selectedLotPoints.length < 2) {
        setMessage(
          "Tiada lot/polygon dipilih untuk export GPX.",
        );
        return;
      }

      const trackPoints: GpsPoint[] =
        selectedLotPoints.map(
          (point, index) => ({
            id: `lot-point-${index + 1}`,
            name: `Lot Point ${index + 1}`,
            lat: point.lat,
            lng: point.lng,
            source: "MANUAL",
            type: "trackpoint",
          }),
        );

      const tracks: GpsTrack[] = [
        {
          id: "selected-lot-boundary",
          name:
            lotName ||
            "SabahLot Selected Lot Boundary",
          points: [
            ...trackPoints,
            trackPoints[0],
          ],
          source: "CSV",
        },
      ];

      const gpx =
        buildGpx({
          name:
            lotName ||
            "SabahLot GPX Export",
          tracks,
        });

      downloadTextFile(
        "sabahlot-selected-lot.gpx",
        gpx,
      );

      setMessage(
        "GPX exported for handheld GPS.",
      );
    };

  return (
    <section className="sl-gps-panel">
      <h3>Handheld GPS</h3>

      <label className="sl-gps-field">
        Import GPS File
        <input
          type="file"
          accept=".gpx,.kml,.csv"
          onChange={handleImportGpsFile}
        />
      </label>

      <div className="sl-gps-row">
        <select
          value={coordinateFormat}
          onChange={(event) =>
            setCoordinateFormat(
              event.target.value as GpsCoordinateFormat,
            )
          }
        >
          <option value="DD">DD</option>
          <option value="DDM">DDM</option>
          <option value="DMS">DMS</option>
        </select>

        <input
          value={coordinateText}
          onChange={(event) =>
            setCoordinateText(
              event.target.value,
            )
          }
          placeholder="5.9804, 116.0735"
        />

        <button
          type="button"
          onClick={handleManualZoom}
        >
          Zoom
        </button>
      </div>

      <select
        className="sl-gps-select"
        value={projection}
        onChange={(event) =>
          setProjection(
            event.target.value as SabahProjection,
          )
        }
      >
        <option value="TIMBALAI_1948_RSO_BORNEO_M">
          Timbalai 1948 / RSO Borneo
        </option>
        <option value="WGS84">
          WGS84 Lat/Long
        </option>
      </select>

      <div className="sl-gps-actions">
        <button
          type="button"
          onClick={onUseDeviceGps}
        >
          {isTracking
            ? "Stop Device GPS"
            : "Gunakan GPS Peranti"}
        </button>

        <button
          type="button"
          onClick={handleExportGpx}
        >
          Export Lot to GPX
        </button>
      </div>

      <p className="sl-gps-disclaimer">
        GPS telefon / handheld adalah untuk rujukan awal sahaja. Bukan GNSS ukur,
        bukan bukti sempadan rasmi, dan bukan pelan ukur sah.
      </p>

      {message && (
        <p className="sl-gps-message">
          {message}
        </p>
      )}
    </section>
  );
}
