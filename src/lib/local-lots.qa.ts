import type { PolygonResult } from "@/app/components/Map";
import {
  EMPTY_LAND_RECORD,
  LOCAL_LOTS_STORAGE_KEY,
  getLocalLots,
  saveLocalLot,
  type LandRecordDetails,
} from "./local-lots";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, "window", {
  value: { localStorage: storage },
  configurable: true,
});

const polygon = {
  coordinates: [
    { lat: 5.98, lng: 116.07 },
    { lat: 5.98, lng: 116.08 },
    { lat: 5.99, lng: 116.08 },
  ],
  areaM2: 100,
  areaHa: 0.01,
  areaAcre: 0.0247,
  perimeterM: 40,
} as PolygonResult;

const landRecord: LandRecordDetails = {
  ...EMPTY_LAND_RECORD,
  landCaseType: "inheritance_land",
  recordsAvailable: ["official_receipt", "gps_coordinates"],
  applicationAge: "over_20_years",
  issueTags: ["lost_documents", "boundary_dispute"],
  originalApplicantName: "Original Applicant",
  originalApplicantStatus: "deceased",
  mainHeirName: "Main Heir",
  relationshipToApplicant: "Child",
  heirsCanIdentifyLocation: "yes",
  landHistoryNotes: "Family history retained locally.",
};

const saved = saveLocalLot({
  lotName: "QA Inheritance Lot",
  lotNumber: "QA-2026",
  ownerName: "Owner",
  village: "Village",
  district: "District",
  notes: "General local note",
  landRecord,
  polygon,
});
const loaded = getLocalLots().find((lot) => lot.id === saved.id);

if (!loaded) throw new Error("Saved lot was not loaded after storage round-trip");
if (loaded.notes !== "General local note") throw new Error("General notes were not retained");
if (JSON.stringify(loaded.land_record) !== JSON.stringify(landRecord)) {
  throw new Error("Land record fields were not retained after Save -> Load");
}

storage.setItem(
  LOCAL_LOTS_STORAGE_KEY,
  JSON.stringify([{ ...saved, land_record: undefined }]),
);
const legacyLoaded = getLocalLots()[0];
if (!legacyLoaded || JSON.stringify(legacyLoaded.land_record) !== JSON.stringify(EMPTY_LAND_RECORD)) {
  throw new Error("Legacy local record fallback failed");
}

console.log("Local lot Save -> Load QA: PASS");
