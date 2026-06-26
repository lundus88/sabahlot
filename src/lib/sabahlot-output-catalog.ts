import {
  SABAHLOT_PRICING_REGISTRY,
  type SabahLotOutputPricing,
} from "./sabahlot-pricing-registry";

export interface SabahLotOutputCatalogItem extends SabahLotOutputPricing {
  problemAnswered: string[];
  preliminaryLabel: string;
}

export const SABAHLOT_OUTPUT_CATALOG: SabahLotOutputCatalogItem[] =
  SABAHLOT_PRICING_REGISTRY.map((output) => ({
    ...output,
    preliminaryLabel: "PRELIMINARY / INDICATIVE ONLY",
    problemAnswered: [
      "Di mana tanah saya?",
      "Berapa anggaran keluasan tanah saya?",
      "Apa risiko tanah ini?",
      "Apa langkah seterusnya?",
      "Boleh saya dapat pelan awal?",
    ],
  }));
