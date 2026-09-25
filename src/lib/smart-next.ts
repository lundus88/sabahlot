export type SmartNextActionId =
  | "upload_document"
  | "mark_land"
  | "prepare_application"
  | "professional_help"
  | "review_land_summary";

export type SmartNextLandCaseType =
  | "land_application"
  | "inheritance_land"
  | "family_customary_land"
  | "titled_land"
  | "unsure"
  | "";

export type SmartNextAvailableRecord =
  | "title"
  | "official_receipt"
  | "application_letter"
  | "plan_or_sketch"
  | "gps_coordinates"
  | "site_photos"
  | "no_record";

export type SmartNextIssueTag =
  | "unknown_application_status"
  | "difficult_to_get_information"
  | "lost_documents"
  | "unknown_land_location"
  | "unclear_land_process"
  | "boundary_dispute"
  | "title_subdivision"
  | "customary_land_ncr"
  | "encroachment"
  | "overlapping_land";

export interface SmartNextContext {
  hasPolygon: boolean;
  queuedDocumentCount: number;
  recordsAvailable: readonly SmartNextAvailableRecord[];
  landCaseType: SmartNextLandCaseType;
  issueTags: readonly SmartNextIssueTag[];
}

export type SmartNextReasonCode =
  | "document_context_missing"
  | "location_context_missing"
  | "application_preparation"
  | "professional_attention"
  | "context_ready";

export interface SmartNextRecommendation {
  action: SmartNextActionId;
  reason: SmartNextReasonCode;
  priority: number;
}

const PROFESSIONAL_ATTENTION_ISSUES: readonly SmartNextIssueTag[] = [
  "boundary_dispute",
  "encroachment",
  "overlapping_land",
  "title_subdivision",
];

function hasKnownDocument(context: SmartNextContext): boolean {
  return (
    context.queuedDocumentCount > 0 ||
    context.recordsAvailable.some((record) => record !== "no_record")
  );
}

function hasIssue(
  context: SmartNextContext,
  issue: SmartNextIssueTag,
): boolean {
  return context.issueTags.includes(issue);
}

export function getSmartNextRecommendations(
  context: SmartNextContext,
): SmartNextRecommendation[] {
  const recommendations: SmartNextRecommendation[] = [];
  const hasDocument = hasKnownDocument(context);

  if (
    context.issueTags.some((issue) =>
      PROFESSIONAL_ATTENTION_ISSUES.includes(issue),
    )
  ) {
    recommendations.push({
      action: "professional_help",
      reason: "professional_attention",
      priority: 100,
    });
  }

  if (!hasDocument || hasIssue(context, "lost_documents")) {
    recommendations.push({
      action: "upload_document",
      reason: "document_context_missing",
      priority: 90,
    });
  }

  if (
    !context.hasPolygon ||
    hasIssue(context, "unknown_land_location")
  ) {
    recommendations.push({
      action: "mark_land",
      reason: "location_context_missing",
      priority: 85,
    });
  }

  if (
    context.landCaseType === "land_application" ||
    hasIssue(context, "unknown_application_status") ||
    hasIssue(context, "unclear_land_process")
  ) {
    recommendations.push({
      action: "prepare_application",
      reason: "application_preparation",
      priority: 80,
    });
  }

  if (
    context.hasPolygon &&
    hasDocument &&
    recommendations.length === 0
  ) {
    recommendations.push({
      action: "review_land_summary",
      reason: "context_ready",
      priority: 70,
    });
  }

  if (
    context.hasPolygon &&
    hasDocument &&
    !recommendations.some(
      (recommendation) => recommendation.action === "professional_help",
    )
  ) {
    recommendations.push({
      action: "professional_help",
      reason: "context_ready",
      priority: 60,
    });
  }

  const seen = new Set<SmartNextActionId>();

  return recommendations
    .sort((a, b) => b.priority - a.priority)
    .filter((recommendation) => {
      if (seen.has(recommendation.action)) {
        return false;
      }
      seen.add(recommendation.action);
      return true;
    })
    .slice(0, 3);
}
