export type EvidenceClass =
  | "OFFICIAL_RECORD"
  | "SURVEY_OBSERVATION"
  | "IMPORTED_REFERENCE"
  | "FIELD_REFERENCE"
  | "APPROXIMATE"
  | "UNVERIFIED";

export type EvidenceAuthority =
  | "none"
  | "user-declared"
  | "licensed-surveyor"
  | "government-or-statutory-record";

export interface EvidenceInput {
  source:
    | "official-record"
    | "licensed-survey-plan"
    | "survey-mark"
    | "rtk-gnss"
    | "total-station"
    | "phone-gps"
    | "keyed-coordinate"
    | "kml-import"
    | "geojson-import"
    | "csv-import"
    | "drone"
    | "lidar"
    | "digitised-imagery"
    | "unknown";
  authority?: EvidenceAuthority;
  authorityReference?: string | null;
  sourceCrsVerified?: boolean;
  transformationVerified?: boolean;
  instrumentEvidencePresent?: boolean;
  observationQualityKnown?: boolean;
}

export interface EvidenceDecision {
  evidenceClass: EvidenceClass;
  authority: EvidenceAuthority;
  reasons: string[];
  restrictions: string[];
  officialUseAllowed: boolean;
}

function hasAuthorityReference(input: EvidenceInput): boolean {
  return Boolean(input.authorityReference?.trim());
}

export function classifyEvidence(input: EvidenceInput): EvidenceDecision {
  const authority = input.authority ?? "none";
  const reasons: string[] = [];
  const restrictions: string[] = [];

  if (
    input.source === "official-record" &&
    authority === "government-or-statutory-record" &&
    hasAuthorityReference(input)
  ) {
    reasons.push("Source is explicitly identified as a government/statutory record with a traceable reference.");
    restrictions.push("Record status does not by itself prove that a field position has been correctly recovered on the ground.");
    return {
      evidenceClass: "OFFICIAL_RECORD",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (
    input.source === "licensed-survey-plan" &&
    authority === "licensed-surveyor" &&
    hasAuthorityReference(input)
  ) {
    reasons.push("Source is explicitly identified as a licensed survey plan with a traceable reference.");
    restrictions.push("Plan evidence must still be reconciled with applicable cadastral records and field evidence.");
    return {
      evidenceClass: "OFFICIAL_RECORD",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (input.source === "rtk-gnss" || input.source === "total-station" || input.source === "survey-mark") {
    reasons.push("Source is a survey observation or survey-mark observation.");
    if (input.instrumentEvidencePresent) {
      reasons.push("Instrument/provenance metadata is present.");
    }
    if (input.observationQualityKnown) {
      reasons.push("Observation quality metadata is available.");
    }
    restrictions.push("Measurement quality does not establish cadastral/legal authority.");
    restrictions.push("Independent record/evidence reconciliation is required before official use.");
    return {
      evidenceClass: "SURVEY_OBSERVATION",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (
    input.source === "kml-import" ||
    input.source === "geojson-import" ||
    input.source === "csv-import"
  ) {
    if (!input.sourceCrsVerified) {
      reasons.push("Imported coordinates do not have a verified source CRS.");
      restrictions.push("CRS must be verified before spatial reliance.");
      return {
        evidenceClass: "UNVERIFIED",
        authority,
        reasons,
        restrictions,
        officialUseAllowed: false,
      };
    }

    if (input.transformationVerified === false) {
      reasons.push("Imported coordinates require or may require an unverified transformation.");
      restrictions.push("Do not treat coordinates as transformed/verified.");
      return {
        evidenceClass: "UNVERIFIED",
        authority,
        reasons,
        restrictions,
        officialUseAllowed: false,
      };
    }

    reasons.push("Imported coordinates have a verified source CRS.");
    restrictions.push("File provenance and original survey authority remain separate from CRS correctness.");
    restrictions.push("Imported geometry remains reference evidence unless authoritative source evidence is separately established.");
    return {
      evidenceClass: "IMPORTED_REFERENCE",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (input.source === "phone-gps") {
    reasons.push("Position is derived from consumer/browser geolocation.");
    restrictions.push("Approximate field reference only.");
    restrictions.push("Do not use as cadastral boundary evidence.");
    return {
      evidenceClass: "APPROXIMATE",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (input.source === "keyed-coordinate") {
    reasons.push("Coordinate was manually entered by a user.");
    restrictions.push("Original source and transcription accuracy must be independently verified.");
    return {
      evidenceClass: "FIELD_REFERENCE",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  if (input.source === "drone" || input.source === "lidar" || input.source === "digitised-imagery") {
    reasons.push("Source is derived remote-sensing or digitised spatial evidence.");
    restrictions.push("Useful for spatial context, not cadastral authority by itself.");
    return {
      evidenceClass: "FIELD_REFERENCE",
      authority,
      reasons,
      restrictions,
      officialUseAllowed: false,
    };
  }

  reasons.push("Evidence source is unknown or insufficiently described.");
  restrictions.push("Verify source, CRS/datum, provenance and authority before reliance.");
  return {
    evidenceClass: "UNVERIFIED",
    authority,
    reasons,
    restrictions,
    officialUseAllowed: false,
  };
}

export function evidenceLabel(decision: EvidenceDecision): string {
  return decision.evidenceClass.replaceAll("_", " ");
}
