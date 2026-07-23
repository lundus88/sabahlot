import type {
  GpsQualityGrade,
} from "./field-gps.types";

export function getGpsQualityGrade(
  accuracyMeters?: number | null,
): GpsQualityGrade {
  if (
    typeof accuracyMeters !== "number" ||
    !Number.isFinite(accuracyMeters)
  ) {
    return "D";
  }

  if (accuracyMeters <= 0.5) {
    return "A";
  }

  if (accuracyMeters <= 1) {
    return "B";
  }

  if (accuracyMeters <= 3) {
    return "C";
  }

  return "D";
}

export function getGpsQualityLabel(
  grade: GpsQualityGrade,
): string {
  switch (grade) {
    case "A":
      return "Excellent preliminary field reference";
    case "B":
      return "Good preliminary field reference";
    case "C":
      return "Moderate accuracy";
    default:
      return "Weak accuracy";
  }
}
