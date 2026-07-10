import type { RegionId } from "@/lib/region/regionStorage";

export const FEEDBACK_STORAGE_KEY = "sabahlot_beta_feedback";

export type FeedbackIssueType = "Critical" | "Major" | "Minor" | "Suggestion";

export interface FeedbackEntry {
  id: string;
  submittedAt: string;
  nama: string;
  telefon: string;
  lokasiUjian: string;
  jenisTelefon: string;
  browser: string;
  fungsiDiuji: string;
  jenisIsu: FeedbackIssueType;
  penerangan: string;
  cadangan: string;
  screenshotNote: string;
  region?: RegionId;
  state?: string;
  district?: string;
  module?: string;
}

export type FeedbackEntryInput = Omit<FeedbackEntry, "id" | "submittedAt">;

function createFeedbackId(): string {
  return `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getFeedbackEntries(): FeedbackEntry[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(FEEDBACK_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    return Array.isArray(parsed) ? (parsed as FeedbackEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveFeedbackEntry(
  input: FeedbackEntryInput,
): FeedbackEntry {
  const entry: FeedbackEntry = {
    ...input,
    id: createFeedbackId(),
    submittedAt: new Date().toISOString(),
  };

  const entries = getFeedbackEntries();
  entries.push(entry);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        FEEDBACK_STORAGE_KEY,
        JSON.stringify(entries),
      );
    } catch {
      // If storage is blocked, the entry is still returned to the caller.
    }
  }

  return entry;
}
