import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

const componentSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/FieldGpsLite.tsx",
  ),
  "utf8",
);
const accuracyPanelSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/FieldGpsAccuracyPanel.tsx",
  ),
  "utf8",
);
const cssSource = readFileSync(
  resolve(
    process.cwd(),
    "src/app/globals.css",
  ),
  "utf8",
);

assert(
  accuracyPanelSource.includes(
    'aria-label="Position Quality"',
  ) &&
    accuracyPanelSource.includes(
      "{positionQualityLabel} · {compactAccuracy} · {compactHeading}",
    ),
  "Position Quality must render as the compact quality/accuracy/heading bar.",
);

assert(
  accuracyPanelSource.includes(
    '<details className="sl-field-gps-diagnostics">',
  ) &&
    !accuracyPanelSource.includes(
      '<details className="sl-field-gps-diagnostics" open',
    ),
  "Full position diagnostics must require explicit expansion.",
);

assert(
  componentSource.includes(
    'aria-label="Find Point status"',
  ) &&
    componentSource.includes(
      "targetNavigation.distanceMeters",
    ) &&
    componentSource.includes(
      "compactTargetBearing",
    ) &&
    componentSource.includes(
      "directionArrowDegrees",
    ),
  "Find Point compact status must retain distance, bearing, and direction.",
);

assert(
  componentSource.indexOf(
    "sl-field-gps-quick-actions",
  ) <
    componentSource.indexOf(
      "<FieldGpsAccuracyPanel",
    ) &&
    componentSource.includes(
      '<summary>More GPS tools</summary>',
    ),
  "Start GPS and Track Position must be visible before collapsed secondary tools.",
);

assert(
  componentSource.includes(
    "Preliminary Field Assist",
  ),
  "The Preliminary Field Assist wording must remain present.",
);

const userFacingGpsSources =
  `${componentSource}\n${accuracyPanelSource}`;

assert(
  !userFacingGpsSources.includes(
    ">GPS signal<",
  ) &&
    userFacingGpsSources.includes(
      ">Position Quality<",
    ),
  'User-facing "GPS signal" labels must be replaced by "Position Quality".',
);

assert(
  !/satellite count|HDOP|PDOP/i.test(
    userFacingGpsSources,
  ),
  "Unsupported satellite-count/HDOP/PDOP metrics must not be shown.",
);

const mobileHeightValues = Array.from(
  cssSource.matchAll(
    /\.sl-field-gps-card\s*\{[^{}]*?max-height:\s*min\((\d+)dvh/g,
  ),
  (match) => Number(match[1]),
);

assert(
  mobileHeightValues.length >= 3,
  "Expected mobile Field GPS height contracts were not found.",
);
assert(
  mobileHeightValues.every(
    (value) => value === 80,
  ),
  `Every mobile Field GPS card limit must be 80dvh; found ${mobileHeightValues.join(
    ", ",
  )}.`,
);

assert(
  cssSource.includes(
    "height: min(80dvh, calc(100dvh - 176px",
  ),
  "The mobile Field GPS card must open at 80% viewport height, not only permit that maximum.",
);

assert(
  cssSource.includes("align-content: start;") &&
    cssSource.includes("grid-auto-rows: max-content;"),
  "The 80dvh Field GPS card must keep controls at their natural height when diagnostics are collapsed.",
);

console.log(
  `field-gps-map-first QA: ALL PASS (mobile panel height: ${mobileHeightValues.join(
    ", ",
  )}dvh)`,
);
