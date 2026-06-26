export type SabahLotCurrency = "MYR";
export type SabahLotPricingType = "fixed" | "range" | "quotation";
export type SabahLotOutputType =
  | "pdf"
  | "kml"
  | "export_pack"
  | "record_pack"
  | "professional_pack"
  | "report"
  | "quotation";

export interface SabahLotOutputPricing {
  outputId: string;
  outputName: string;
  outputType: SabahLotOutputType;
  moduleOwner: string;
  basePrice: number;
  minPrice: number;
  maxPrice?: number;
  currency: SabahLotCurrency;
  pricingType: SabahLotPricingType;
  requiresPayment: boolean;
  isPreliminary: boolean;
  disclaimerRequired: boolean;
  manualReviewRequired: boolean;
  sensitivityLevel: "low" | "medium" | "high";
  includedInPackage: string[];
  userFacingDescription: string;
}

export const MINIMUM_OUTPUT_PRICE_MYR = 59;

export const SABAHLOT_PRICING_REGISTRY: SabahLotOutputPricing[] = [
  {
    outputId: "basic-preliminary-plan-pdf",
    outputName: "Basic Preliminary Plan PDF",
    outputType: "pdf",
    moduleOwner: "preliminary-output",
    basePrice: 59,
    minPrice: 59,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: false,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Pelan ringkas preliminary dengan peta, keluasan anggaran dan disclaimer.",
  },
  {
    outputId: "pdf-kml-export-pack",
    outputName: "PDF + KML Export Pack",
    outputType: "export_pack",
    moduleOwner: "gis-export",
    basePrice: 99,
    minPrice: 99,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: false,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Pakej eksport preliminary PDF dan KML untuk rujukan kerja awal.",
  },
  {
    outputId: "land-record-summary-pdf",
    outputName: "Land Record Summary PDF",
    outputType: "pdf",
    moduleOwner: "land-record-organizer",
    basePrice: 99,
    minPrice: 99,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: false,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Ringkasan rekod tanah, dokumen, isu dan langkah seterusnya.",
  },
  {
    outputId: "standard-land-record-pack",
    outputName: "Standard Land Record Pack",
    outputType: "record_pack",
    moduleOwner: "land-record-organizer",
    basePrice: 197,
    minPrice: 197,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: false,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Pakej rekod standard untuk menyusun maklumat tanah dan dokumen asas.",
  },
  {
    outputId: "assisted-land-record-pack",
    outputName: "Assisted Land Record Pack",
    outputType: "record_pack",
    moduleOwner: "assisted-service",
    basePrice: 297,
    minPrice: 297,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Bantuan menyusun rekod tanah preliminary sebelum rujukan profesional.",
  },
  {
    outputId: "boundary-concern-record-pack",
    outputName: "Boundary Concern Record Pack",
    outputType: "record_pack",
    moduleOwner: "risk-review",
    basePrice: 397,
    minPrice: 397,
    currency: "MYR",
    pricingType: "fixed",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Rekod isu sempadan untuk semakan awal dan rujukan profesional.",
  },
  {
    outputId: "ncr-preliminary-record-pack",
    outputName: "NCR Preliminary Record Pack",
    outputType: "record_pack",
    moduleOwner: "risk-review",
    basePrice: 397,
    minPrice: 397,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Pakej rekod preliminary NCR/tanah adat. Bukan keputusan NCR.",
  },
  {
    outputId: "proposed-house-site-allocation-plan",
    outputName: "Proposed House Site Allocation Plan",
    outputType: "pdf",
    moduleOwner: "preliminary-output",
    basePrice: 197,
    minPrice: 197,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Cadangan pembahagian tapak rumah untuk perbincangan awal keluarga.",
  },
  {
    outputId: "subdivision-readiness-pack",
    outputName: "Subdivision Readiness Pack",
    outputType: "professional_pack",
    moduleOwner: "professional-referral",
    basePrice: 497,
    minPrice: 497,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Senarai kesiapsiagaan awal sebelum rujukan pecah geran profesional.",
  },
  {
    outputId: "listing-preliminary-plan",
    outputName: "Listing Preliminary Plan",
    outputType: "pdf",
    moduleOwner: "listing-support",
    basePrice: 99,
    minPrice: 99,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: false,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Pelan preliminary untuk perbincangan listing, bukan pengesahan hakmilik.",
  },
  {
    outputId: "buyer-seller-information-pack",
    outputName: "Buyer / Seller Information Pack",
    outputType: "record_pack",
    moduleOwner: "listing-support",
    basePrice: 197,
    minPrice: 197,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Maklumat awal untuk pembeli/penjual sebelum semakan rasmi dan nasihat guaman.",
  },
  {
    outputId: "topo-drone-scope-report",
    outputName: "Topo / Drone Scope Report",
    outputType: "report",
    moduleOwner: "professional-referral",
    basePrice: 297,
    minPrice: 297,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "medium",
    includedInPackage: [],
    userFacingDescription:
      "Skop awal kerja topo/drone untuk quotation profesional.",
  },
  {
    outputId: "professional-gis-cad-export-pack",
    outputName: "Professional GIS/CAD Export Pack",
    outputType: "professional_pack",
    moduleOwner: "gis-export",
    basePrice: 297,
    minPrice: 297,
    currency: "MYR",
    pricingType: "range",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Pakej eksport GIS/CAD preliminary. CRS profesional perlu disahkan.",
  },
  {
    outputId: "custom-project-report",
    outputName: "Custom Project Report",
    outputType: "quotation",
    moduleOwner: "professional-referral",
    basePrice: 497,
    minPrice: 497,
    currency: "MYR",
    pricingType: "quotation",
    requiresPayment: true,
    isPreliminary: true,
    disclaimerRequired: true,
    manualReviewRequired: true,
    sensitivityLevel: "high",
    includedInPackage: [],
    userFacingDescription:
      "Laporan khas mengikut skop projek. Harga melalui quotation.",
  },
];

export function assertSabahLotPricingRegistry(): void {
  const invalid = SABAHLOT_PRICING_REGISTRY.find(
    (output) =>
      output.requiresPayment &&
      output.minPrice < MINIMUM_OUTPUT_PRICE_MYR,
  );

  if (invalid) {
    throw new Error(
      `${invalid.outputId} is below SabahLot minimum output price.`,
    );
  }
}

export function getSabahLotOutputPricing(
  outputId: string,
): SabahLotOutputPricing {
  const pricing = SABAHLOT_PRICING_REGISTRY.find(
    (output) => output.outputId === outputId,
  );

  if (!pricing) {
    throw new Error(`Missing SabahLot pricing for ${outputId}.`);
  }

  if (pricing.requiresPayment && pricing.minPrice < MINIMUM_OUTPUT_PRICE_MYR) {
    throw new Error(
      `${pricing.outputId} is below SabahLot minimum output price.`,
    );
  }

  return pricing;
}

export function formatSabahLotPrice(
  pricing: SabahLotOutputPricing,
): string {
  const amount = `RM${pricing.basePrice.toLocaleString("en-MY")}`;

  if (pricing.pricingType === "quotation") {
    return "Quotation";
  }

  if (pricing.pricingType === "range") {
    return `${amount} ke atas`;
  }

  return amount;
}
