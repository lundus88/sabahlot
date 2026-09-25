import {
  getSmartNextRecommendations,
  type SmartNextContext,
} from "./smart-next";

function expectActions(
  name: string,
  context: SmartNextContext,
  expected: readonly string[],
) {
  const actual = getSmartNextRecommendations(context).map(
    (item) => item.action,
  );
  const same =
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);

  if (!same) {
    throw new Error(
      `${name}: expected ${expected.join(",")} but got ${actual.join(",")}`,
    );
  }
}

const base: SmartNextContext = {
  hasPolygon: false,
  queuedDocumentCount: 0,
  recordsAvailable: [],
  landCaseType: "",
  issueTags: [],
};

expectActions("new user", base, [
  "upload_document",
  "mark_land",
]);

expectActions(
  "application with unclear process",
  {
    ...base,
    hasPolygon: true,
    queuedDocumentCount: 1,
    landCaseType: "land_application",
    issueTags: ["unclear_land_process"],
  },
  ["prepare_application", "professional_help"],
);

expectActions(
  "boundary dispute",
  {
    ...base,
    hasPolygon: true,
    queuedDocumentCount: 1,
    landCaseType: "titled_land",
    issueTags: ["boundary_dispute"],
  },
  ["professional_help"],
);

expectActions(
  "ready context",
  {
    ...base,
    hasPolygon: true,
    queuedDocumentCount: 1,
    landCaseType: "titled_land",
  },
  ["review_land_summary", "professional_help"],
);

expectActions(
  "lost documents and unknown location",
  {
    ...base,
    recordsAvailable: ["no_record"],
    landCaseType: "unsure",
    issueTags: ["lost_documents", "unknown_land_location"],
  },
  ["upload_document", "mark_land"],
);

console.log("smart-next QA: PASS");
