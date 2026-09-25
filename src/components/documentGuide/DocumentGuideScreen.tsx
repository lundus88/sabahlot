"use client";

import type { ChangeEvent } from "react";

import { Icon } from "@/app/components/Map";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import type { CloudDocumentType } from "@/lib/land-records/types";

const GUIDE_DOCUMENT_TYPES = [
  "site_photo",
  "title_deed",
  "official_receipt",
  "application_letter",
  "plan_or_sketch",
  "other",
] as const satisfies readonly CloudDocumentType[];

type GuideDocumentType = (typeof GUIDE_DOCUMENT_TYPES)[number];

const COPY = {
  en: {
    title: "Upload a Land Document",
    subtitle: "Start with the document you already have. SabahLot will guide you on what it is for, what to prepare, and what to do next.",
    typeLabel: "Document type",
    fileLabel: "Choose document or photo",
    queued: (count: number) => `${count} file${count === 1 ? "" : "s"} ready to save`,
    guideTitle: "SabahLot guidance",
    steps: ["Understand the document", "Check what information is available", "See what may still be needed", "Choose the next action"],
    openRecord: "Continue with My Land",
    getHelp: "Get Professional Help",
    close: "Close",
    privacy: "Only upload documents you are comfortable using for this land matter. Sensitive information should be kept to the minimum needed.",
    official: "SabahLot explains and prepares. Official processing and decisions remain with the relevant authority or professional.",
    options: {
      site_photo: "Site photo",
      title_deed: "Title deed",
      official_receipt: "Official receipt",
      application_letter: "Land application letter / form",
      plan_or_sketch: "Plan or sketch",
      other: "Other land document",
    } as Record<GuideDocumentType, string>,
    guides: {
      site_photo: ["Use clear photos that show the site or boundary evidence.", "Add the photo to the same land record so it can be reviewed with the map and notes."],
      title_deed: ["Check the lot/title reference, district and registered details shown on the document.", "Use the document together with your SabahLot map before requesting professional help."],
      official_receipt: ["Keep the receipt reference and date with the related land matter.", "If the receipt relates to an application, add the application details to My Land."],
      application_letter: ["Check the application reference, applicant details, location and purpose.", "SabahLot can help you organise supporting documents before you continue through the official channel."],
      plan_or_sketch: ["Check whether the plan shows useful lot, boundary, coordinate or location information.", "Compare it with your SabahLot map and mark anything that needs clarification."],
      other: ["Add the document to the correct land record.", "Use Get Professional Help if you are unsure what the document means or what action should follow."],
    } as Record<GuideDocumentType, string[]>,
  },
  ms: {
    title: "Muat Naik Dokumen Tanah",
    subtitle: "Mulakan dengan dokumen yang anda sudah ada. SabahLot akan memberi panduan tentang kegunaannya, apa yang perlu disediakan dan tindakan seterusnya.",
    typeLabel: "Jenis dokumen",
    fileLabel: "Pilih dokumen atau gambar",
    queued: (count: number) => `${count} fail sedia untuk disimpan`,
    guideTitle: "Panduan SabahLot",
    steps: ["Fahami dokumen", "Semak maklumat yang tersedia", "Lihat apa yang masih diperlukan", "Pilih tindakan seterusnya"],
    openRecord: "Teruskan ke Tanah Saya",
    getHelp: "Dapatkan Bantuan Profesional",
    close: "Tutup",
    privacy: "Muat naik hanya dokumen yang anda selesa gunakan untuk urusan tanah ini. Maklumat sensitif hendaklah diminimumkan.",
    official: "SabahLot menerangkan dan membantu persediaan. Proses serta keputusan rasmi kekal di bawah pihak berkuasa atau profesional berkaitan.",
    options: {
      site_photo: "Gambar tapak",
      title_deed: "Hakmilik / geran tanah",
      official_receipt: "Resit rasmi",
      application_letter: "Surat / borang permohonan tanah",
      plan_or_sketch: "Pelan atau lakaran",
      other: "Dokumen tanah lain",
    } as Record<GuideDocumentType, string>,
    guides: {
      site_photo: ["Gunakan gambar yang jelas untuk menunjukkan keadaan tapak atau bukti sempadan.", "Simpan gambar bersama rekod tanah yang sama supaya boleh dirujuk bersama peta dan nota."],
      title_deed: ["Semak rujukan lot/hakmilik, daerah dan butiran berdaftar pada dokumen.", "Gunakan dokumen bersama peta SabahLot sebelum mendapatkan bantuan profesional."],
      official_receipt: ["Simpan nombor rujukan dan tarikh resit bersama urusan tanah berkaitan.", "Jika resit berkaitan permohonan, tambah butiran permohonan dalam Tanah Saya."],
      application_letter: ["Semak rujukan permohonan, butiran pemohon, lokasi dan tujuan.", "SabahLot boleh membantu menyusun dokumen sokongan sebelum anda meneruskan melalui saluran rasmi."],
      plan_or_sketch: ["Semak sama ada pelan menunjukkan maklumat lot, sempadan, koordinat atau lokasi yang berguna.", "Bandingkan dengan peta SabahLot dan tandakan perkara yang perlu diperjelaskan."],
      other: ["Masukkan dokumen ke rekod tanah yang betul.", "Gunakan Dapatkan Bantuan Profesional jika anda tidak pasti maksud dokumen atau tindakan seterusnya."],
    } as Record<GuideDocumentType, string[]>,
  },
} as const;

export interface DocumentGuideScreenProps {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  documentType: CloudDocumentType;
  onDocumentTypeChange: (type: CloudDocumentType) => void;
  queuedCount: number;
  onFilesSelected: (event: ChangeEvent<HTMLInputElement>) => void;
  onOpenLandRecord: () => void;
  onGetProfessionalHelp: () => void;
}

export default function DocumentGuideScreen({
  open,
  onClose,
  language,
  documentType,
  onDocumentTypeChange,
  queuedCount,
  onFilesSelected,
  onOpenLandRecord,
  onGetProfessionalHelp,
}: DocumentGuideScreenProps) {
  if (!open) {
    return null;
  }

  const copy = language === "ms" ? COPY.ms : COPY.en;
  const guideDocumentType: GuideDocumentType =
    GUIDE_DOCUMENT_TYPES.includes(documentType as GuideDocumentType)
      ? (documentType as GuideDocumentType)
      : "other";
  const guidance = copy.guides[guideDocumentType];

  return (
    <div className="sl-document-guide-backdrop" role="presentation" onClick={onClose}>
      <section
        className="sl-document-guide-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-document-guide-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="sl-document-guide-header">
          <div>
            <span className="sl-document-guide-eyebrow">SabahLot Document Guide</span>
            <h2 id="sl-document-guide-title">{copy.title}</h2>
            <p>{copy.subtitle}</p>
          </div>
          <button
            type="button"
            className="sl-icon-button"
            onClick={onClose}
            aria-label={copy.close}
          >
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </header>

        <div className="sl-document-guide-upload">
          <label>
            <span>{copy.typeLabel}</span>
            <select
              value={documentType}
              onChange={(event) =>
                onDocumentTypeChange(event.target.value as CloudDocumentType)
              }
            >
              {GUIDE_DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {copy.options[type]}
                </option>
              ))}
            </select>
          </label>

          <label className="sl-document-guide-file">
            <span>{copy.fileLabel}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              multiple
              onChange={onFilesSelected}
            />
          </label>

          {queuedCount > 0 && (
            <p className="sl-document-guide-queued" role="status">
              {copy.queued(queuedCount)}
            </p>
          )}
        </div>

        <div className="sl-document-guide-card">
          <h3>{copy.guideTitle}</h3>
          <ol className="sl-document-guide-steps">
            {copy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <ul className="sl-document-guide-notes">
            {guidance.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <p className="sl-document-guide-privacy">{copy.privacy}</p>
        <p className="sl-document-guide-official">{copy.official}</p>

        <div className="sl-document-guide-actions">
          <button type="button" className="sl-document-guide-secondary" onClick={onOpenLandRecord}>
            {copy.openRecord}
          </button>
          <button type="button" className="sl-document-guide-primary" onClick={onGetProfessionalHelp}>
            {copy.getHelp}
          </button>
        </div>
      </section>
    </div>
  );
}
