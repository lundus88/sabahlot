import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";

export type RegionId = "sabah" | "sarawak" | "peninsular";

export type RegionStatus = "ga" | "controlled_beta";

export interface RegionDefinition {
  id: RegionId;
  status: RegionStatus;
  label: Record<AppLanguage, string>;
}

export const REGION_DEFINITIONS: Record<RegionId, RegionDefinition> = {
  sabah: {
    id: "sabah",
    status: "ga",
    label: { en: "Sabah", ms: "Sabah", zh: "沙巴" },
  },
  sarawak: {
    id: "sarawak",
    status: "controlled_beta",
    label: { en: "Sarawak", ms: "Sarawak", zh: "砂拉越" },
  },
  peninsular: {
    id: "peninsular",
    status: "controlled_beta",
    label: {
      en: "Peninsular Malaysia",
      ms: "Semenanjung Malaysia",
      zh: "马来西亚半岛",
    },
  },
};

export const REGION_ORDER: readonly RegionId[] = ["sabah", "sarawak", "peninsular"];

export const REGION_STORAGE_KEY = "sabahlot_region";

const VALID_REGIONS: readonly RegionId[] = ["sabah", "sarawak", "peninsular"];

export function getStoredRegion(): RegionId {
  if (typeof window === "undefined") {
    return "sabah";
  }

  try {
    const stored = window.localStorage.getItem(REGION_STORAGE_KEY);
    if (stored && (VALID_REGIONS as string[]).includes(stored)) {
      return stored as RegionId;
    }
    return "sabah";
  } catch {
    return "sabah";
  }
}

export function setStoredRegion(region: RegionId): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(REGION_STORAGE_KEY, region);
  } catch {
    // If storage is blocked, the preference simply won't persist across visits.
  }
}
