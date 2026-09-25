"use client";

import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import {
  getSmartNextRecommendations,
  type SmartNextActionId,
  type SmartNextContext,
  type SmartNextReasonCode,
} from "@/lib/smart-next";

const COPY = {
  en: {
    eyebrow: "Smart What Next?",
    title: "What should you do next?",
    empty: "Add some land information and SabahLot will suggest the next useful step.",
    actions: {
      upload_document: "Upload a Land Document",
      mark_land: "Mark My Land",
      prepare_application: "Prepare Land Application",
      professional_help: "Get Professional Help",
      review_land_summary: "Review My Land",
    } as Record<SmartNextActionId, string>,
    reasons: {
      document_context_missing: "A document can help clarify the land matter.",
      location_context_missing: "Marking the land gives the next step better context.",
      application_preparation: "Your current information points to an application-preparation step.",
      professional_attention: "This matter may benefit from professional review.",
      context_ready: "You already have enough context to continue.",
    } as Record<SmartNextReasonCode, string>,
  },
  ms: {
    eyebrow: "Smart What Next?",
    title: "Apa tindakan seterusnya?",
    empty: "Tambah maklumat tanah dan SabahLot akan cadangkan langkah berguna seterusnya.",
    actions: {
      upload_document: "Muat Naik Dokumen Tanah",
      mark_land: "Tandakan Tanah Saya",
      prepare_application: "Sediakan Permohonan Tanah",
      professional_help: "Dapatkan Bantuan Profesional",
      review_land_summary: "Semak Tanah Saya",
    } as Record<SmartNextActionId, string>,
    reasons: {
      document_context_missing: "Dokumen boleh membantu menjelaskan urusan tanah ini.",
      location_context_missing: "Menandakan tanah memberi konteks yang lebih baik untuk langkah seterusnya.",
      application_preparation: "Maklumat semasa menunjukkan langkah persediaan permohonan.",
      professional_attention: "Urusan ini mungkin memerlukan semakan profesional.",
      context_ready: "Konteks anda sudah mencukupi untuk meneruskan.",
    } as Record<SmartNextReasonCode, string>,
  },
} as const;

export interface SmartNextPanelProps {
  language: AppLanguage;
  context: SmartNextContext;
  onAction: (action: SmartNextActionId) => void;
}

export default function SmartNextPanel({
  language,
  context,
  onAction,
}: SmartNextPanelProps) {
  const copy = language === "ms" ? COPY.ms : COPY.en;
  const recommendations = getSmartNextRecommendations(context);

  return (
    <section className="sl-smart-next" aria-label={copy.title}>
      <div className="sl-smart-next-heading">
        <span>{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
      </div>

      {recommendations.length === 0 ? (
        <p className="sl-smart-next-empty">{copy.empty}</p>
      ) : (
        <div className="sl-smart-next-list">
          {recommendations.map((recommendation, index) => (
            <button
              key={recommendation.action}
              type="button"
              className={`sl-smart-next-item ${
                index === 0 ? "is-primary" : ""
              }`}
              onClick={() => onAction(recommendation.action)}
            >
              <span className="sl-smart-next-rank">{index + 1}</span>
              <span className="sl-smart-next-copy">
                <strong>{copy.actions[recommendation.action]}</strong>
                <small>{copy.reasons[recommendation.reason]}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
