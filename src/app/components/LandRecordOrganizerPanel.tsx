"use client";

import { useMemo, useState } from "react";

type LandType =
  | "Unknown"
  | "NT"
  | "FR"
  | "CL"
  | "TL"
  | "PL"
  | "CT"
  | "LA"
  | "PT"
  | "TOL"
  | "NCR"
  | "PANTAS";

type ChecklistKey =
  | "title"
  | "plan"
  | "ownerId"
  | "tax"
  | "powerLetter"
  | "sitePhoto"
  | "accessInfo";

type RiskTag =
  | "Boundary unclear"
  | "Document incomplete"
  | "Family / inheritance issue"
  | "Access road unclear"
  | "Needs professional review";

interface LandRecord {
  id: string;
  name: string;
  district: string;
  village: string;
  landType: LandType;
  titleReference: string;
  ownerName: string;
  notes: string;
  checklist: Record<ChecklistKey, boolean>;
  riskTags: RiskTag[];
  createdAt: string;
}

const STORAGE_KEY = "sabahlot-land-record-organizer-v1";

const landTypeOptions: Array<{
  value: LandType;
  label: string;
}> = [
  { value: "Unknown", label: "Please select / Not sure" },
  { value: "NT", label: "NT - Native Title" },
  { value: "FR", label: "FR - Field Register" },
  { value: "CL", label: "CL - Country Lease" },
  { value: "TL", label: "TL - Town Lease" },
  { value: "PL", label: "PL - Provisional Lease" },
  { value: "CT", label: "CT - Communal Title" },
  { value: "LA", label: "LA - Land Application" },
  { value: "PT", label: "PT - Permohonan Tanah" },
  { value: "TOL", label: "TOL - Temporary Occupation Licence" },
  { value: "NCR", label: "NCR - Native Customary Rights" },
  { value: "PANTAS", label: "PANTAS" },
];

const districtOptions = [
  "Beaufort",
  "Beluran",
  "Kalabakan",
  "Keningau",
  "Kimanis",
  "Kinabatangan",
  "Kota Belud",
  "Kota Kinabalu",
  "Kota Marudu",
  "Kuala Penyu",
  "Kudat",
  "Kunak",
  "Lahad Datu",
  "Membakut",
  "Nabawan",
  "Paitan",
  "Papar",
  "Penampang",
  "Pitas",
  "Putatan",
  "Ranau",
  "Sandakan",
  "Semporna",
  "Sipitang",
  "Sook",
  "Tambunan",
  "Tawau",
  "Telupid",
  "Tenom",
  "Tongod",
];

const checklistLabels: Record<ChecklistKey, string> = {
  title: "Title / copy of title",
  plan: "Land plan / sketch plan",
  ownerId: "Owner identity card",
  tax: "Land rent / related receipt",
  powerLetter: "Authorization / inheritance document",
  sitePhoto: "Site / access photo",
  accessInfo: "Access road information",
};

const riskOptions: RiskTag[] = [
  "Boundary unclear",
  "Document incomplete",
  "Family / inheritance issue",
  "Access road unclear",
  "Needs professional review",
];

function createEmptyChecklist(): Record<ChecklistKey, boolean> {
  return {
    title: false,
    plan: false,
    ownerId: false,
    tax: false,
    powerLetter: false,
    sitePhoto: false,
    accessInfo: false,
  };
}

function getLandTypeLabel(value: LandType): string {
  return landTypeOptions.find((option) => option.value === value)?.label ?? value;
}

function loadRecords(): LandRecord[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed as LandRecord[];
  } catch {
    return [];
  }
}

function saveRecords(records: LandRecord[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export default function LandRecordOrganizerPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [records, setRecords] = useState<LandRecord[]>(() => loadRecords());

  const [name, setName] = useState("");
  const [district, setDistrict] = useState("");
  const [village, setVillage] = useState("");
  const [landType, setLandType] = useState<LandType>("Unknown");
  const [titleReference, setTitleReference] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [notes, setNotes] = useState("");
  const [checklist, setChecklist] =
    useState<Record<ChecklistKey, boolean>>(createEmptyChecklist);
  const [riskTags, setRiskTags] = useState<RiskTag[]>([]);

  const completedChecklist = useMemo(
    () => Object.values(checklist).filter(Boolean).length,
    [checklist],
  );

  const totalChecklist = Object.keys(checklistLabels).length;

  function toggleChecklist(key: ChecklistKey) {
    setChecklist((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  function toggleRisk(tag: RiskTag) {
    setRiskTags((current) =>
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
    );
  }

  function resetForm() {
    setName("");
    setDistrict("");
    setVillage("");
    setLandType("Unknown");
    setTitleReference("");
    setOwnerName("");
    setNotes("");
    setChecklist(createEmptyChecklist());
    setRiskTags([]);
  }

  function handleSave() {
    const record: LandRecord = {
      id: `land-record-${Date.now()}`,
      name: name.trim() || "Untitled land record",
      district: district.trim(),
      village: village.trim(),
      landType,
      titleReference: titleReference.trim(),
      ownerName: ownerName.trim(),
      notes: notes.trim(),
      checklist,
      riskTags,
      createdAt: new Date().toISOString(),
    };

    const nextRecords = [record, ...records].slice(0, 20);

    setRecords(nextRecords);
    saveRecords(nextRecords);
    resetForm();
  }

  function handleDeleteRecord(id: string) {
    const nextRecords = records.filter((record) => record.id !== id);

    setRecords(nextRecords);
    saveRecords(nextRecords);
  }

  return (
    <section className={isOpen ? "sl-land-record-panel is-open" : "sl-land-record-panel"}>
      <button
        type="button"
        className="sl-land-record-toggle"
        onClick={() => setIsOpen((value) => !value)}
      >
        <span>Land Record</span>
        <strong>{isOpen ? "Close" : "Open"}</strong>
      </button>

      {isOpen && (
        <div className="sl-land-record-body">
          <header className="sl-land-record-header">
            <h3>Land Record Organizer</h3>
            <p>
              Organize basic land information, documents and early issues privately on this device.
            </p>
          </header>

          <div className="sl-land-record-warning">
            This record is for preliminary reference only. It is not ownership confirmation,
            not official boundary evidence, and not authority approval.
          </div>

          <div className="sl-land-record-grid">
            <label>
              Land record name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Example: Family land Kg. X"
              />
            </label>

            <label>
              Land type
              <select
                value={landType}
                onChange={(event) => setLandType(event.target.value as LandType)}
              >
                {landTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              District
              <select
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
              >
                <option value="">
                  Please select district
                </option>
                {districtOptions.map((districtName) => (
                  <option
                    key={districtName}
                    value={districtName}
                  >
                    {districtName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Village / Mukim
              <input
                value={village}
                onChange={(event) => setVillage(event.target.value)}
                placeholder="Example: Kg. X"
              />
            </label>

            <label>
              Title / reference no.
              <input
                value={titleReference}
                onChange={(event) => setTitleReference(event.target.value)}
                placeholder="If available"
              />
            </label>

            <label>
              Owner / family name
              <input
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                placeholder="If applicable"
              />
            </label>
          </div>

          <div className="sl-land-record-section-title">
            Document Checklist
            <span>
              {completedChecklist}/{totalChecklist}
            </span>
          </div>

          <div className="sl-land-record-checklist">
            {Object.entries(checklistLabels).map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={checklist[key as ChecklistKey]}
                  onChange={() => toggleChecklist(key as ChecklistKey)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>

          <div className="sl-land-record-section-title">Issue / Risk Tags</div>

          <div className="sl-land-record-tags">
            {riskOptions.map((tag) => (
              <button
                key={tag}
                type="button"
                className={riskTags.includes(tag) ? "is-active" : ""}
                onClick={() => toggleRisk(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <label className="sl-land-record-notes">
            Notes
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Brief notes: boundary issue, access, inheritance, documents, follow-up action..."
            />
          </label>

          <button type="button" className="sl-land-record-save" onClick={handleSave}>
            Save Land Record
          </button>

          <div className="sl-land-record-summary">
            <strong>Saved Records</strong>

            {records.length === 0 && <p>No saved records yet.</p>}

            <div className="sl-land-record-list">
              {records.map((record) => (
                <article key={record.id}>
                  <div>
                    <strong>{record.name}</strong>
                    <span>
                      {record.district || "No district"} · {getLandTypeLabel(record.landType)}
                    </span>
                  </div>

                  <button type="button" onClick={() => handleDeleteRecord(record.id)}>
                    Delete
                  </button>
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

