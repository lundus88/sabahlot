"use client";

import {
  getGpsQualityLabel,
} from "@/lib/gps-quality";

import type {
  FieldGpsReading,
} from "@/lib/field-gps.types";

interface FieldGpsAccuracyPanelProps {
  reading: FieldGpsReading | null;
  status: string;
  qualityGrade: "A" | "B" | "C" | "D";
  gateMeters: number | null;
  onGateChange: (value: number | null) => void;
  allowApproximate: boolean;
  onAllowApproximateChange: (value: boolean) => void;
}

function valueOrDash(
  value: number | string | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return "-";
  }

  return String(value);
}

export default function FieldGpsAccuracyPanel({
  reading,
  status,
  qualityGrade,
  gateMeters,
  onGateChange,
  allowApproximate,
  onAllowApproximateChange,
}: FieldGpsAccuracyPanelProps) {
  const accuracyWeak =
    Boolean(
      gateMeters !== null &&
        reading?.accuracyMeters !== undefined &&
        reading.accuracyMeters >
          gateMeters,
    );

  return (
    <section className="sl-field-gps-section">
      <div className="sl-field-gps-status-row">
        <strong>{status}</strong>
        <span className={`sl-gps-grade is-${qualityGrade.toLowerCase()}`}>
          {qualityGrade}
        </span>
      </div>

      <p className="sl-field-gps-quality">
        {getGpsQualityLabel(qualityGrade)}
      </p>

      {accuracyWeak && (
        <p className="sl-field-gps-warning">
          GPS accuracy is weak. Move to an open area and wait for better accuracy. You may still save this point as approximate.
        </p>
      )}

      <div className="sl-field-gps-grid">
        <span>Latitude</span>
        <strong>{valueOrDash(reading?.latitude.toFixed(7))}</strong>
        <span>Longitude</span>
        <strong>{valueOrDash(reading?.longitude.toFixed(7))}</strong>
        <span>Accuracy</span>
        <strong>
          {reading?.accuracyMeters !== undefined
            ? `+/- ${reading.accuracyMeters.toFixed(1)} m`
            : "-"}
        </strong>
        <span>Altitude</span>
        <strong>
          {reading?.altitude !== null &&
          reading?.altitude !== undefined
            ? `${reading.altitude.toFixed(1)} m`
            : "-"}
        </strong>
        <span>Altitude accuracy</span>
        <strong>
          {reading?.altitudeAccuracyMeters !== null &&
          reading?.altitudeAccuracyMeters !== undefined
            ? `+/- ${reading.altitudeAccuracyMeters.toFixed(1)} m`
            : "-"}
        </strong>
        <span>Heading</span>
        <strong>
          {reading?.heading !== null &&
          reading?.heading !== undefined
            ? `${reading.heading.toFixed(0)} deg`
            : "-"}
        </strong>
        <span>Speed</span>
        <strong>
          {reading?.speed !== null &&
          reading?.speed !== undefined
            ? `${reading.speed.toFixed(2)} m/s`
            : "-"}
        </strong>
        <span>Timestamp</span>
        <strong>{valueOrDash(reading?.timestamp)}</strong>
      </div>

      <label className="sl-field-gps-label">
        <span>Minimum accuracy gate</span>
        <select
          value={gateMeters ?? "none"}
          onChange={(event) =>
            onGateChange(
              event.target.value === "none"
                ? null
                : Number(event.target.value),
            )
          }
        >
          <option value={5}>5 m</option>
          <option value={10}>10 m</option>
          <option value={25}>25 m</option>
          <option value="none">No gate</option>
        </select>
      </label>

      <label className="sl-field-gps-check">
        <input
          type="checkbox"
          checked={allowApproximate}
          onChange={(event) =>
            onAllowApproximateChange(
              event.target.checked,
            )
          }
        />
        <span>Save approximate point anyway</span>
      </label>
    </section>
  );
}
