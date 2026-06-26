import type {
  LandRecordDetails,
} from "./local-lots";

export type SabahLotRiskLevel =
  | "low"
  | "medium"
  | "high"
  | "professional_review_required";

export interface SabahLotRiskFlag {
  ruleId: string;
  label: string;
  level: SabahLotRiskLevel;
  manualReviewRequired: boolean;
  userFacingMessage: string;
}

export interface SabahLotRiskInput {
  landRecord: LandRecordDetails;
  lotNumber?: string;
  titleNumber?: string;
  coordinateSystem?: string;
  intendedOfficialUse?: boolean;
}

export interface SabahLotRiskAssessment {
  level: SabahLotRiskLevel;
  manualReviewRequired: boolean;
  flags: SabahLotRiskFlag[];
}

const RISK_PRIORITY: Record<SabahLotRiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  professional_review_required: 4,
};

export function evaluateSabahLotRisk(
  input: SabahLotRiskInput,
): SabahLotRiskAssessment {
  const {
    landRecord,
  } = input;
  const flags: SabahLotRiskFlag[] = [];
  const addFlag = (flag: SabahLotRiskFlag) => {
    flags.push(flag);
  };

  if (
    landRecord.landCaseType === "family_customary_land" ||
    landRecord.issueTags.includes("customary_land_ncr")
  ) {
    addFlag({
      ruleId: "risk-ncr-customary-land",
      label: "NCR / tanah adat",
      level: "high",
      manualReviewRequired: true,
      userFacingMessage:
        "NCR atau tanah adat perlu semakan manual/profesional. SabahLot tidak membuat keputusan NCR.",
    });
  }

  if (landRecord.issueTags.includes("boundary_dispute")) {
    addFlag({
      ruleId: "risk-boundary-dispute",
      label: "Pertikaian sempadan",
      level: "professional_review_required",
      manualReviewRequired: true,
      userFacingMessage:
        "Pertikaian sempadan perlu rujukan juruukur berlesen atau pihak berkaitan.",
    });
  }

  if (landRecord.issueTags.includes("overlapping_land")) {
    addFlag({
      ruleId: "risk-overlap",
      label: "Lot bertindih",
      level: "professional_review_required",
      manualReviewRequired: true,
      userFacingMessage:
        "Lot bertindih tidak boleh diputuskan oleh SabahLot. Semakan rasmi diperlukan.",
    });
  }

  if (landRecord.issueTags.includes("lost_documents")) {
    addFlag({
      ruleId: "risk-incomplete-documents",
      label: "Dokumen tidak lengkap / hilang",
      level: "medium",
      manualReviewRequired: false,
      userFacingMessage:
        "Dokumen tidak lengkap boleh melambatkan semakan rasmi. Susun rekod sokongan dahulu.",
    });
  }

  if (landRecord.landCaseType === "inheritance_land") {
    addFlag({
      ruleId: "risk-inheritance",
      label: "Waris / pusaka",
      level: "high",
      manualReviewRequired: true,
      userFacingMessage:
        "Isu waris/pusaka perlu semakan dokumen dan nasihat profesional jika digunakan untuk urusan rasmi.",
    });
  }

  if (landRecord.issueTags.includes("unknown_land_location")) {
    addFlag({
      ruleId: "risk-unknown-location",
      label: "Lokasi tanah tidak pasti",
      level: "medium",
      manualReviewRequired: false,
      userFacingMessage:
        "Lokasi tidak pasti. Gunakan peta, dokumen dan koordinat sebagai rujukan awal sahaja.",
    });
  }

  if (!input.lotNumber?.trim()) {
    addFlag({
      ruleId: "risk-lot-number-unknown",
      label: "No. lot tidak pasti",
      level: "medium",
      manualReviewRequired: false,
      userFacingMessage:
        "No. lot belum lengkap. Output hanya boleh dianggap preliminary.",
    });
  }

  if (!input.titleNumber?.trim()) {
    addFlag({
      ruleId: "risk-title-number-unknown",
      label: "Title number tidak pasti",
      level: "medium",
      manualReviewRequired: false,
      userFacingMessage:
        "Title number tidak pasti. Jangan anggap ini sebagai carian hakmilik rasmi.",
    });
  }

  if (
    !input.coordinateSystem ||
    input.coordinateSystem === "unknown"
  ) {
    addFlag({
      ruleId: "risk-coordinate-system-unknown",
      label: "Sistem koordinat tidak pasti",
      level: "medium",
      manualReviewRequired: false,
      userFacingMessage:
        "Sistem koordinat tidak pasti. RSO Borneo memerlukan fasa profesional.",
    });
  }

  if (input.intendedOfficialUse) {
    addFlag({
      ruleId: "risk-official-use",
      label: "Penggunaan rasmi diminta",
      level: "professional_review_required",
      manualReviewRequired: true,
      userFacingMessage:
        "Output SabahLot tidak boleh digunakan sebagai dokumen rasmi tanpa semakan pihak berkuasa/profesional.",
    });
  }

  const level =
    flags.reduce<SabahLotRiskLevel>(
      (highest, flag) =>
        RISK_PRIORITY[flag.level] > RISK_PRIORITY[highest]
          ? flag.level
          : highest,
      "low",
    );

  return {
    level,
    manualReviewRequired: flags.some(
      (flag) => flag.manualReviewRequired,
    ),
    flags,
  };
}
