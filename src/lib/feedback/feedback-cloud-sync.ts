// sprint-feedback-cloud-sync: syncs FeedbackModal.tsx submissions to
// public.feedback, in addition to -- never instead of -- the existing
// localStorage save (feedbackStorage.ts, untouched by this sprint).
// Fire-and-forget: a failed cloud sync never blocks or fails the local
// save, and is not retried automatically -- see
// docs/ai/SPRINT_BRIEF_feedback-cloud-sync.md, Design decision 4.
//
// Standalone table, no land_records parent -- unlike every land-records
// child module (points/parties/documents/geometry), there is no "wait for
// parent sync" ordering requirement and no update/conflict-retry path:
// every submission is a fresh INSERT, gated only by isCloudWriteEnabled()
// (Dev-only; no per-module Production write gate exists for this table --
// see the brief's Design decision 5, deliberately not built speculatively).

import type { SupabaseClient } from "@supabase/supabase-js";

import { isCloudWriteEnabled } from "../land-records/feature-gate";
import type { RegionId } from "../region/regionStorage";
import type { FeedbackEntryInput, FeedbackIssueType } from "./feedbackStorage";

export type FeedbackSyncStatus =
  | "local_only"
  | "feedback_synced"
  | "invalid_input"
  | "failed"
  | "network_error";

export interface FeedbackSyncResult {
  status: FeedbackSyncStatus;
  message?: string;
}

const VALID_ISSUE_TYPES: readonly FeedbackIssueType[] = [
  "Critical",
  "Major",
  "Minor",
  "Suggestion",
];

function isValidIssueType(value: string): value is FeedbackIssueType {
  return (VALID_ISSUE_TYPES as readonly string[]).includes(value);
}

function toNullableText(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface FeedbackRow {
  user_id: string | null;
  submitted_name: string | null;
  phone: string | null;
  test_location: string | null;
  phone_type: string | null;
  browser: string | null;
  module_tested: string | null;
  issue_type: FeedbackIssueType;
  description: string | null;
  suggestion: string | null;
  screenshot_note: string | null;
  region: RegionId | null;
  state: string | null;
  district: string | null;
  module: string | null;
}

// user_id is always derived from the session here, never accepted as a
// field on FeedbackEntryInput (ADR-005 pattern used throughout
// src/lib/land-records/) -- that type structurally has no such field.
function mapEntryToRow(
  input: FeedbackEntryInput,
  userId: string | null,
): FeedbackRow {
  return {
    user_id: userId,
    submitted_name: toNullableText(input.nama),
    phone: toNullableText(input.telefon),
    test_location: toNullableText(input.lokasiUjian),
    phone_type: toNullableText(input.jenisTelefon),
    browser: toNullableText(input.browser),
    module_tested: toNullableText(input.fungsiDiuji),
    issue_type: input.jenisIsu,
    description: toNullableText(input.penerangan),
    suggestion: toNullableText(input.cadangan),
    screenshot_note: toNullableText(input.screenshotNote),
    region: input.region ?? null,
    state: toNullableText(input.state),
    district: toNullableText(input.district),
    module: toNullableText(input.module),
  };
}

/**
 * Syncs one feedback submission to public.feedback, alongside (never
 * instead of) the existing localStorage save. Anonymous submission is
 * allowed -- when no session exists, user_id is written as null, matching
 * the feedback_insert_anon RLS policy's `user_id is null` check.
 *
 * Never throws -- every failure path (gate closed, validation, network,
 * database) returns a settled FeedbackSyncResult instead, so a caller can
 * safely fire this without blocking on or catching around it.
 */
export async function syncFeedbackToCloud(
  supabase: SupabaseClient,
  input: FeedbackEntryInput,
): Promise<FeedbackSyncResult> {
  if (!isCloudWriteEnabled()) {
    return { status: "local_only" };
  }

  if (!isValidIssueType(input.jenisIsu)) {
    return {
      status: "invalid_input",
      message: "jenisIsu is not one of the accepted issue types.",
    };
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id ?? null;

    const { error } = await supabase
      .from("feedback")
      .insert(mapEntryToRow(input, userId));

    if (error) {
      return {
        status: "failed",
        message: "Cloud feedback sync failed; the local copy is safe.",
      };
    }

    return { status: "feedback_synced" };
  } catch (error) {
    return {
      status: "network_error",
      message:
        error instanceof Error ? error.message : "Unknown feedback sync error.",
    };
  }
}
