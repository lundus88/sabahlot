export const FIELD_ASSIST_ACTIVE_TARGET_STORAGE_KEY =
  "sabahlot_field_assist_active_target";

export interface FieldAssistActiveTarget {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export function isFieldAssistActiveTarget(
  value: unknown,
): value is FieldAssistActiveTarget {
  if (!value || typeof value !== "object") {
    return false;
  }

  const target = value as Partial<FieldAssistActiveTarget>;

  return (
    typeof target.id === "string" &&
    typeof target.label === "string" &&
    typeof target.latitude === "number" &&
    Number.isFinite(target.latitude) &&
    target.latitude >= -90 &&
    target.latitude <= 90 &&
    typeof target.longitude === "number" &&
    Number.isFinite(target.longitude) &&
    target.longitude >= -180 &&
    target.longitude <= 180 &&
    typeof target.createdAt === "string" &&
    typeof target.updatedAt === "string"
  );
}

export function readFieldAssistActiveTarget(): FieldAssistActiveTarget | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const stored = localStorage.getItem(
      FIELD_ASSIST_ACTIVE_TARGET_STORAGE_KEY,
    );
    const parsed = stored ? JSON.parse(stored) : null;

    return isFieldAssistActiveTarget(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeFieldAssistActiveTarget(
  target: FieldAssistActiveTarget,
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(
      FIELD_ASSIST_ACTIVE_TARGET_STORAGE_KEY,
      JSON.stringify(target),
    );
  } catch {
    // Active target still works in memory for this session if storage is blocked.
  }
}

export function clearFieldAssistActiveTarget(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(FIELD_ASSIST_ACTIVE_TARGET_STORAGE_KEY);
  } catch {
    // Ignore storage errors; nothing to clear if storage is blocked.
  }
}
