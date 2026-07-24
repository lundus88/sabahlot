"use client";

import { useState } from "react";

import {
  bearingToDms,
  calculateFieldGpsBearingDegrees,
  calculateFieldGpsDistanceMeters,
} from "@/lib/field-gps";
import type { FieldGpsPoint } from "@/lib/field-gps.types";

const METERS_PER_FOOT = 0.3048;
const METERS_PER_LINK = 0.201168;
const METERS_PER_CHAIN = 20.1168;

interface FieldGpsInversePanelProps {
  points: FieldGpsPoint[];
}

export default function FieldGpsInversePanel({
  points,
}: FieldGpsInversePanelProps) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");

  if (points.length < 2) {
    return null;
  }

  const fromPoint = points.find(
    (point) => point.id === fromId,
  );
  const toPoint = points.find(
    (point) => point.id === toId,
  );

  const hasResult =
    fromPoint &&
    toPoint &&
    fromPoint.id !== toPoint.id;

  const distanceMeters = hasResult
    ? calculateFieldGpsDistanceMeters(
        [
          fromPoint.latitude,
          fromPoint.longitude,
        ],
        [
          toPoint.latitude,
          toPoint.longitude,
        ],
      )
    : null;

  const forwardBearing = hasResult
    ? calculateFieldGpsBearingDegrees(
        [
          fromPoint.latitude,
          fromPoint.longitude,
        ],
        [
          toPoint.latitude,
          toPoint.longitude,
        ],
      )
    : null;

  const backBearing =
    forwardBearing !== null
      ? (forwardBearing + 180) % 360
      : null;

  return (
    <section
      className="sl-field-gps-section"
      id="sl-field-gps-inverse-section"
    >
      <div className="sl-field-gps-heading">
        <span>Inverse (bearing &amp; distance)</span>
      </div>

      <div className="sl-field-gps-grid">
        <label>
          From
          <select
            value={fromId}
            onChange={(event) =>
              setFromId(event.target.value)
            }
          >
            <option value="">Select point</option>
            {points.map((point) => (
              <option
                key={point.id}
                value={point.id}
              >
                {point.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          To
          <select
            value={toId}
            onChange={(event) =>
              setToId(event.target.value)
            }
          >
            <option value="">Select point</option>
            {points.map((point) => (
              <option
                key={point.id}
                value={point.id}
              >
                {point.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {hasResult &&
      distanceMeters !== null &&
      forwardBearing !== null &&
      backBearing !== null ? (
        <div className="sl-field-gps-grid">
          <span>Forward bearing</span>
          <strong>
            {bearingToDms(forwardBearing)}
          </strong>

          <span>Back bearing</span>
          <strong>
            {bearingToDms(backBearing)}
          </strong>

          <span>Distance</span>
          <strong>
            {distanceMeters.toFixed(3)} m
            {" / "}
            {(
              distanceMeters / METERS_PER_FOOT
            ).toFixed(2)}{" "}
            ft
            {" / "}
            {(
              distanceMeters / METERS_PER_LINK
            ).toFixed(2)}{" "}
            lk
            {" / "}
            {(
              distanceMeters / METERS_PER_CHAIN
            ).toFixed(3)}{" "}
            ch
          </strong>
        </div>
      ) : (
        <p className="sl-field-gps-note">
          Select two different points to calculate bearing and distance.
        </p>
      )}

      <p className="sl-field-gps-disclaimer">
        Inverse computed from device GPS coordinates (WGS84), not adjusted
        cadastral coordinates.
      </p>
    </section>
  );
}
