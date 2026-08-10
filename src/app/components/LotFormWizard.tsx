"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import type { LotFormData, LotPageText } from "../page";
import type {
  ApplicantStatus,
  AvailableRecord,
  HeirLocationKnowledge,
  LandIssueTag,
  LandRecordDetails,
} from "@/lib/local-lots";

const LAND_CASE_VALUES = [
  "land_application",
  "inheritance_land",
  "family_customary_land",
  "titled_land",
  "unsure",
] as const;

const AVAILABLE_RECORD_VALUES: readonly AvailableRecord[] = [
  "title",
  "official_receipt",
  "application_letter",
  "plan_or_sketch",
  "gps_coordinates",
  "site_photos",
  "no_record",
];

const APPLICATION_AGE_VALUES = [
  "under_5_years",
  "5_to_10_years",
  "10_to_20_years",
  "over_20_years",
  "unsure",
] as const;

const ISSUE_TAG_VALUES: readonly LandIssueTag[] = [
  "unknown_application_status",
  "difficult_to_get_information",
  "lost_documents",
  "unknown_land_location",
  "unclear_land_process",
  "boundary_dispute",
  "title_subdivision",
  "customary_land_ncr",
  "encroachment",
  "overlapping_land",
];

const APPLICANT_STATUS_VALUES: readonly ApplicantStatus[] = [
  "alive",
  "deceased",
  "unknown",
];

const HEIR_LOCATION_VALUES: readonly HeirLocationKnowledge[] = [
  "yes",
  "no",
  "not_sure",
];

type WizardStepId =
  | "basic"
  | "caseType"
  | "records"
  | "age"
  | "family"
  | "issues"
  | "notes"
  | "review";

const ALL_STEP_IDS: WizardStepId[] = [
  "basic",
  "caseType",
  "records",
  "age",
  "family",
  "issues",
  "notes",
  "review",
];

interface LotFormWizardProps {
  formData: LotFormData;
  text: LotPageText;
  updateField: (
    field: Exclude<keyof LotFormData, "landRecord">,
    value: string,
  ) => void;
  updateLandRecordField: <K extends keyof LandRecordDetails>(
    field: K,
    value: LandRecordDetails[K],
  ) => void;
  toggleAvailableRecord: (record: AvailableRecord) => void;
  toggleIssueTag: (tag: LandIssueTag) => void;
  reviewAndSave: ReactNode;
}

export default function LotFormWizard({
  formData,
  text,
  updateField,
  updateLandRecordField,
  toggleAvailableRecord,
  toggleIssueTag,
  reviewAndSave,
}: LotFormWizardProps) {
  const [stepId, setStepId] = useState<WizardStepId>("basic");

  const landCaseType = formData.landRecord.landCaseType;

  const activeSteps = ALL_STEP_IDS.filter((id) => {
    if (id === "age" && landCaseType === "titled_land") {
      return false;
    }

    if (
      id === "family" &&
      landCaseType !== "inheritance_land" &&
      landCaseType !== "family_customary_land"
    ) {
      return false;
    }

    return true;
  });

  // If a field change (e.g. changing land case type) skips the current
  // step, fall back to the first active step for this render instead of
  // syncing via an effect -- keeps this component free of any hook that
  // could reintroduce a Rules-of-Hooks-adjacent footgun.
  const effectiveStepId = activeSteps.includes(stepId)
    ? stepId
    : activeSteps[0];

  const currentIndex = activeSteps.indexOf(effectiveStepId);
  const totalSteps = activeSteps.length;
  const percent = Math.round(
    ((currentIndex + 1) / totalSteps) * 100,
  );

  const progressLabel = text.wizardProgressTemplate
    .replace("{current}", String(currentIndex + 1))
    .replace("{total}", String(totalSteps));

  const goNext = () => {
    const nextStep = activeSteps[currentIndex + 1];
    if (nextStep) {
      setStepId(nextStep);
    }
  };

  const goBack = () => {
    const prevStep = activeSteps[currentIndex - 1];
    if (prevStep) {
      setStepId(prevStep);
    }
  };

  const stepTitle: Record<WizardStepId, string> = {
    basic: text.wizardStepBasicTitle,
    caseType: text.wizardStepCaseTypeTitle,
    records: text.wizardStepRecordsTitle,
    age: text.wizardStepAgeTitle,
    family: text.wizardStepFamilyTitle,
    issues: text.wizardStepIssuesTitle,
    notes: text.wizardStepNotesTitle,
    review: text.wizardStepReviewTitle,
  };

  const basicComplete =
    formData.ownerName.trim().length > 0 &&
    formData.lotNumber.trim().length > 0 &&
    formData.village.trim().length > 0 &&
    formData.district.trim().length > 0;

  const caseTypeComplete = landCaseType.trim().length > 0;

  const nextDisabled =
    (effectiveStepId === "basic" && !basicComplete) ||
    (effectiveStepId === "caseType" && !caseTypeComplete);

  return (
    <div className="sl-wizard">
      <div className="sl-wizard-progress">
        <div className="sl-wizard-progress-track">
          <div
            className="sl-wizard-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="sl-wizard-progress-label">
          <span>{progressLabel}</span>
          <span>{percent}%</span>
        </div>
      </div>

      <div className="sl-record-section sl-wizard-step">
        <p className="sl-wizard-step-title">
          {stepTitle[effectiveStepId]}
        </p>

        {effectiveStepId === "basic" && (
          <div className="sl-record-section-body">
            <label>
              <span>{text.ownerName}</span>
              <input
                type="text"
                value={formData.ownerName}
                onChange={(event) =>
                  updateField("ownerName", event.target.value)
                }
                placeholder={text.ownerPlaceholder}
                autoComplete="name"
              />
            </label>

            <label>
              <span>{text.lotNumber}</span>
              <input
                type="text"
                value={formData.lotNumber}
                onChange={(event) =>
                  updateField("lotNumber", event.target.value)
                }
                placeholder={text.lotPlaceholder}
                autoComplete="off"
              />
            </label>

            <label>
              <span>{text.village}</span>
              <input
                type="text"
                value={formData.village}
                onChange={(event) =>
                  updateField("village", event.target.value)
                }
                placeholder={text.villagePlaceholder}
                autoComplete="address-level3"
              />
            </label>

            <label>
              <span>{text.district}</span>
              <input
                type="text"
                value={formData.district}
                onChange={(event) =>
                  updateField("district", event.target.value)
                }
                placeholder={text.districtPlaceholder}
                autoComplete="address-level2"
              />
            </label>
          </div>
        )}

        {effectiveStepId === "caseType" && (
          <div className="sl-record-section-body">
            <label>
              <span>{text.landCaseTypeLabel}</span>
              <select
                value={landCaseType}
                onChange={(event) =>
                  updateLandRecordField(
                    "landCaseType",
                    event.target.value as LandRecordDetails["landCaseType"],
                  )
                }
              >
                <option value="">
                  {text.landCaseTypePlaceholder}
                </option>
                {LAND_CASE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {text.landCaseOptions[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {effectiveStepId === "records" && (
          <div className="sl-record-section-body">
            <fieldset className="sl-record-checklist">
              <legend>{text.recordsAvailableLabel}</legend>
              {AVAILABLE_RECORD_VALUES.map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={formData.landRecord.recordsAvailable.includes(
                      value,
                    )}
                    onChange={() => toggleAvailableRecord(value)}
                  />
                  <span>{text.availableRecordOptions[value]}</span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {effectiveStepId === "age" && (
          <div className="sl-record-section-body">
            <label>
              <span>{text.applicationAgeLabel}</span>
              <select
                value={formData.landRecord.applicationAge}
                onChange={(event) =>
                  updateLandRecordField(
                    "applicationAge",
                    event.target.value as LandRecordDetails["applicationAge"],
                  )
                }
              >
                <option value="">
                  {text.applicationAgePlaceholder}
                </option>
                {APPLICATION_AGE_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {text.applicationAgeOptions[value]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {effectiveStepId === "family" && (
          <div className="sl-record-section-body">
            <label>
              <span>{text.originalApplicantNameLabel}</span>
              <input
                type="text"
                value={formData.landRecord.originalApplicantName}
                onChange={(event) =>
                  updateLandRecordField(
                    "originalApplicantName",
                    event.target.value,
                  )
                }
                autoComplete="off"
              />
            </label>

            <label>
              <span>{text.originalApplicantStatusLabel}</span>
              <select
                value={formData.landRecord.originalApplicantStatus}
                onChange={(event) =>
                  updateLandRecordField(
                    "originalApplicantStatus",
                    event.target.value as LandRecordDetails["originalApplicantStatus"],
                  )
                }
              >
                <option value="">
                  {text.originalApplicantStatusPlaceholder}
                </option>
                {APPLICANT_STATUS_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === "alive"
                      ? text.statusAlive
                      : value === "deceased"
                        ? text.statusDeceased
                        : text.statusUnknown}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{text.mainHeirNameLabel}</span>
              <input
                type="text"
                value={formData.landRecord.mainHeirName}
                onChange={(event) =>
                  updateLandRecordField(
                    "mainHeirName",
                    event.target.value,
                  )
                }
                autoComplete="off"
              />
            </label>

            <label>
              <span>{text.relationshipToApplicantLabel}</span>
              <input
                type="text"
                value={formData.landRecord.relationshipToApplicant}
                onChange={(event) =>
                  updateLandRecordField(
                    "relationshipToApplicant",
                    event.target.value,
                  )
                }
                autoComplete="off"
              />
            </label>

            <label>
              <span>{text.heirsCanIdentifyLocationLabel}</span>
              <select
                value={formData.landRecord.heirsCanIdentifyLocation}
                onChange={(event) =>
                  updateLandRecordField(
                    "heirsCanIdentifyLocation",
                    event.target.value as LandRecordDetails["heirsCanIdentifyLocation"],
                  )
                }
              >
                <option value="">
                  {text.heirsCanIdentifyLocationPlaceholder}
                </option>
                {HEIR_LOCATION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {value === "yes"
                      ? text.answerYes
                      : value === "no"
                        ? text.answerNo
                        : text.answerNotSure}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{text.landHistoryNotesLabel}</span>
              <textarea
                value={formData.landRecord.landHistoryNotes}
                onChange={(event) =>
                  updateLandRecordField(
                    "landHistoryNotes",
                    event.target.value,
                  )
                }
                rows={4}
              />
            </label>
          </div>
        )}

        {effectiveStepId === "issues" && (
          <div className="sl-record-section-body">
            <fieldset className="sl-record-checklist">
              <legend>{text.issueTagsLegend}</legend>
              {ISSUE_TAG_VALUES.map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={formData.landRecord.issueTags.includes(
                      value,
                    )}
                    onChange={() => toggleIssueTag(value)}
                  />
                  <span>{text.issueTagOptions[value]}</span>
                </label>
              ))}
            </fieldset>
          </div>
        )}

        {effectiveStepId === "notes" && (
          <div className="sl-record-section-body">
            <label>
              <span>{text.generalNotesLabel}</span>
              <textarea
                value={formData.notes}
                onChange={(event) =>
                  updateField("notes", event.target.value)
                }
                rows={4}
              />
            </label>
          </div>
        )}

        {effectiveStepId === "review" && (
          <div className="sl-record-section-body sl-wizard-review-body">
            <p className="sl-wizard-review-heading">
              {text.wizardReviewHeading}
            </p>

            <dl className="sl-wizard-review-list">
              <div>
                <dt>{text.ownerName}</dt>
                <dd>
                  {formData.ownerName.trim() ||
                    text.reviewNotProvided}
                </dd>
              </div>
              <div>
                <dt>{text.lotNumber}</dt>
                <dd>
                  {formData.lotNumber.trim() ||
                    text.reviewNotProvided}
                </dd>
              </div>
              <div>
                <dt>{text.village}</dt>
                <dd>
                  {formData.village.trim() ||
                    text.reviewNotProvided}
                </dd>
              </div>
              <div>
                <dt>{text.district}</dt>
                <dd>
                  {formData.district.trim() ||
                    text.reviewNotProvided}
                </dd>
              </div>
              <div>
                <dt>{text.landCaseTypeLabel}</dt>
                <dd>
                  {landCaseType
                    ? text.landCaseOptions[landCaseType]
                    : text.reviewNotProvided}
                </dd>
              </div>
              {activeSteps.includes("age") && (
                <div>
                  <dt>{text.applicationAgeLabel}</dt>
                  <dd>
                    {formData.landRecord.applicationAge
                      ? text.applicationAgeOptions[
                          formData.landRecord.applicationAge
                        ]
                      : text.reviewNotProvided}
                  </dd>
                </div>
              )}
              {activeSteps.includes("family") && (
                <div>
                  <dt>{text.mainHeirNameLabel}</dt>
                  <dd>
                    {formData.landRecord.mainHeirName.trim() ||
                      text.reviewNotProvided}
                  </dd>
                </div>
              )}
              <div>
                <dt>{text.issueTagsLegend}</dt>
                <dd>
                  {formData.landRecord.issueTags.length > 0
                    ? formData.landRecord.issueTags
                        .map((tag) => text.issueTagOptions[tag])
                        .join(", ")
                    : text.reviewNoneSelected}
                </dd>
              </div>
              <div>
                <dt>{text.generalNotesLabel}</dt>
                <dd>
                  {formData.notes.trim() || text.reviewNotProvided}
                </dd>
              </div>
            </dl>

            <p className="sl-record-section-hint sl-wizard-disclaimer-repeat">
              {text.wizardDisclaimerReminder}
            </p>

            {reviewAndSave}
          </div>
        )}
      </div>

      <div className="sl-wizard-nav">
        {effectiveStepId !== "basic" && (
          <button
            type="button"
            className="sl-wizard-nav-back"
            onClick={goBack}
          >
            {text.wizardBack}
          </button>
        )}

        {effectiveStepId !== "review" && (
          <button
            type="button"
            className="sl-wizard-nav-next"
            onClick={goNext}
            disabled={nextDisabled}
          >
            {text.wizardNext}
          </button>
        )}
      </div>
    </div>
  );
}
