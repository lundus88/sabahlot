"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type StakeoutPathOverlayProps = {
  distance: number | null;
  relativeAngle: number | null;
  north: number | null;
  east: number | null;
  accuracy: number | null;
  movingAway: boolean;
  targetName: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeSigned(value: number) {
  return ((value + 540) % 360) - 180;
}

function formatDistance(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "-";
  if (value < 10) return `${value.toFixed(1)} m`;
  return `${value.toFixed(0)} m`;
}

export default function StakeoutPathOverlay({
  distance,
  relativeAngle,
  north,
  east,
  accuracy,
  movingAway,
  targetName,
}: StakeoutPathOverlayProps) {
  const smoothedAngleRef = useRef<number | null>(null);
  const [visualAngle, setVisualAngle] = useState<number | null>(relativeAngle);

  useEffect(() => {
    if (relativeAngle === null || !Number.isFinite(relativeAngle)) {
      smoothedAngleRef.current = null;
      setVisualAngle(null);
      return;
    }

    const previous = smoothedAngleRef.current;
    if (previous === null) {
      smoothedAngleRef.current = relativeAngle;
      setVisualAngle(relativeAngle);
      return;
    }

    const delta = normalizeSigned(relativeAngle - previous);
    const next = previous + delta * 0.18;
    smoothedAngleRef.current = next;
    setVisualAngle(next);
  }, [relativeAngle]);

  const approachMode = distance !== null && distance <= 3;

  const pathGeometry = useMemo(() => {
    const userX = 110;
    const userY = 270;
    const angle = clamp(visualAngle ?? 0, -70, 70);
    const targetX = clamp(110 + angle * 1.08, 34, 186);
    const targetY = 42;
    const dx = targetX - userX;
    const dy = targetY - userY;
    const rotation = (Math.atan2(dx, -dy) * 180) / Math.PI;

    const pointAt = (t: number) => ({
      x: userX + dx * t,
      y: userY + dy * t,
    });

    return {
      userX,
      userY,
      targetX,
      targetY,
      rotation,
      chevrons: [0.34, 0.5, 0.66, 0.8].map(pointAt),
    };
  }, [visualAngle]);

  const gridGeometry = useMemo(() => {
    if (north === null || east === null) return null;

    const scale = 27;
    return {
      targetX: 110,
      targetY: 110,
      userX: clamp(110 - east * scale, 22, 198),
      userY: clamp(110 + north * scale, 22, 198),
      accuracyRadius:
        accuracy !== null && Number.isFinite(accuracy)
          ? clamp(accuracy * scale, 10, 86)
          : 0,
    };
  }, [north, east, accuracy]);

  if (approachMode) {
    return (
      <div
        style={{
          justifySelf: "center",
          width: "min(72vw, 300px)",
          aspectRatio: "1 / 1",
          borderRadius: 24,
          background: "rgba(15, 23, 42, 0.72)",
          border: "1px solid rgba(255,255,255,0.42)",
          boxShadow: "0 18px 36px rgba(2,6,23,0.32)",
          padding: 8,
          zIndex: 4,
        }}
      >
        <svg viewBox="0 0 220 220" width="100%" height="100%" role="img" aria-label="Target-centered GNSS stakeout grid">
          <defs>
            <marker id="grid-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="white" />
            </marker>
          </defs>
          <circle cx="110" cy="110" r="92" fill="rgba(2,6,23,0.34)" stroke="rgba(255,255,255,0.32)" strokeWidth="1.5" />
          <line x1="110" y1="18" x2="110" y2="202" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <line x1="18" y1="110" x2="202" y2="110" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
          <text x="110" y="14" textAnchor="middle" fill="white" fontSize="12" fontWeight="900">N</text>
          <text x="210" y="114" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">E</text>
          <text x="110" y="216" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">S</text>
          <text x="10" y="114" textAnchor="middle" fill="white" fontSize="10" fontWeight="800">W</text>

          {gridGeometry && gridGeometry.accuracyRadius > 0 && (
            <circle
              cx={gridGeometry.userX}
              cy={gridGeometry.userY}
              r={gridGeometry.accuracyRadius}
              fill="rgba(59,130,246,0.08)"
              stroke="rgba(147,197,253,0.55)"
              strokeWidth="1.5"
              strokeDasharray="5 4"
            />
          )}

          {gridGeometry && (
            <line
              x1={gridGeometry.userX}
              y1={gridGeometry.userY}
              x2={gridGeometry.targetX}
              y2={gridGeometry.targetY}
              stroke={movingAway ? "#fecaca" : "#ffffff"}
              strokeWidth="4"
              strokeLinecap="round"
              markerEnd="url(#grid-arrow)"
            />
          )}

          <circle cx="110" cy="110" r="15" fill="rgba(239,68,68,0.18)" stroke="#fecaca" strokeWidth="2" />
          <circle cx="110" cy="110" r="8" fill="#ef4444" stroke="white" strokeWidth="3" />
          <line x1="94" y1="110" x2="126" y2="110" stroke="white" strokeWidth="1.6" />
          <line x1="110" y1="94" x2="110" y2="126" stroke="white" strokeWidth="1.6" />
          <text x="110" y="139" textAnchor="middle" fill="white" fontSize="10" fontWeight="900">TARGET</text>

          {gridGeometry && (
            <>
              <circle cx={gridGeometry.userX} cy={gridGeometry.userY} r="11" fill="#2563eb" stroke="#dbeafe" strokeWidth="3" />
              <circle cx={gridGeometry.userX} cy={gridGeometry.userY} r="3" fill="white" />
              <text
                x={gridGeometry.userX}
                y={gridGeometry.userY + (gridGeometry.userY < 150 ? -16 : 22)}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="900"
              >
                YOU
              </text>
            </>
          )}
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        justifySelf: "center",
        width: "min(92vw, 430px)",
        height: "min(48vh, 430px)",
        minHeight: 320,
        zIndex: 4,
      }}
    >
      <svg viewBox="0 0 220 300" width="100%" height="100%" role="img" aria-label="AR dotted-line stakeout path">
        <defs>
          <filter id="target-shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity="0.45" />
          </filter>
        </defs>

        <line
          x1={pathGeometry.userX}
          y1={pathGeometry.userY}
          x2={pathGeometry.targetX}
          y2={pathGeometry.targetY}
          stroke={movingAway ? "#fecaca" : "#3b82f6"}
          strokeWidth="5"
          strokeDasharray="3 10"
          strokeLinecap="round"
        />

        {pathGeometry.chevrons.map((point, index) => (
          <g
            key={`${point.x}-${point.y}-${index}`}
            transform={`translate(${point.x} ${point.y}) rotate(${pathGeometry.rotation})`}
          >
            <path
              d="M -16 10 L 0 -7 L 16 10"
              fill="none"
              stroke={movingAway ? "#fecaca" : "#1687f8"}
              strokeWidth="8"
              strokeLinecap="square"
              strokeLinejoin="miter"
            />
            <path
              d="M -16 10 L 0 -7 L 16 10"
              fill="none"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="2"
            />
          </g>
        ))}

        <g filter="url(#target-shadow)">
          <circle cx={pathGeometry.targetX} cy={pathGeometry.targetY} r="15" fill="rgba(254,202,202,0.55)" />
          <circle cx={pathGeometry.targetX} cy={pathGeometry.targetY} r="10" fill="#ef4444" stroke="white" strokeWidth="2.5" />
        </g>

        <g transform={`translate(${clamp(pathGeometry.targetX, 54, 166)} ${pathGeometry.targetY + 31})`}>
          <rect x="-47" y="-15" width="94" height="30" rx="15" fill="rgba(37,99,235,0.92)" />
          <text x="0" y="6" textAnchor="middle" fill="white" fontSize="15" fontWeight="900">
            {formatDistance(distance)}
          </text>
        </g>

        <circle cx={pathGeometry.userX} cy={pathGeometry.userY} r="12" fill="#2563eb" stroke="white" strokeWidth="3" />
        <path
          d={`M ${pathGeometry.userX} ${pathGeometry.userY - 29} L ${pathGeometry.userX - 9} ${pathGeometry.userY - 10} L ${pathGeometry.userX + 9} ${pathGeometry.userY - 10} Z`}
          fill="rgba(15,23,42,0.92)"
          stroke="white"
          strokeWidth="1.5"
        />
        <text x={pathGeometry.userX} y={pathGeometry.userY + 27} textAnchor="middle" fill="white" fontSize="11" fontWeight="900">
          YOU
        </text>
        <text x={pathGeometry.userX} y={pathGeometry.userY + 43} textAnchor="middle" fill="rgba(255,255,255,0.86)" fontSize="9" fontWeight="800">
          PHONE HEAD ↑
        </text>

        <text x="110" y="294" textAnchor="middle" fill="rgba(255,255,255,0.92)" fontSize="10" fontWeight="800">
          {targetName} · follow dotted path
        </text>
      </svg>
    </div>
  );
}
