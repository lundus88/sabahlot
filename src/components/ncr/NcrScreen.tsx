"use client";

import { Icon, formatAreaDisplay, type PolygonResult } from "@/app/components/Map";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText } from "@/lib/i18n/appText";

export interface NcrScreenProps {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  polygon: PolygonResult | null;
  landHistoryNotes: string;
  onLandHistoryNotesChange: (value: string) => void;
  recordsAvailableCount: number;
  onStartRecord: () => void;
  onOpenPlansExport: () => void;
  onOpenSupportingEvidence: () => void;
  onRequestReview: () => void;
}

export default function NcrScreen({
  open,
  onClose,
  language,
  polygon,
  landHistoryNotes,
  onLandHistoryNotesChange,
  recordsAvailableCount,
  onStartRecord,
  onOpenPlansExport,
  onOpenSupportingEvidence,
  onRequestReview,
}: NcrScreenProps) {
  const text = getAppText(language);
  const ncr = text.ncrScreen;

  if (!open) {
    return null;
  }

  return (
    <div className="sl-ncr-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sl-ncr-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-ncr-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sl-ncr-header">
          <div>
            <h2 id="sl-ncr-title">{ncr.title}</h2>
            <p className="sl-ncr-subtitle">{ncr.subtitle}</p>
          </div>
          <button
            type="button"
            className="sl-icon-button"
            onClick={onClose}
            aria-label={ncr.close}
          >
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <div className="sl-ncr-actions">
          <button type="button" className="sl-ncr-action" onClick={onStartRecord}>
            <span className="sl-ncr-action-label">{ncr.startRecord}</span>
          </button>

          <button type="button" className="sl-ncr-action" onClick={onClose}>
            <span className="sl-ncr-action-label">{ncr.searchLocation}</span>
          </button>

          <button type="button" className="sl-ncr-action" onClick={onClose}>
            <span className="sl-ncr-action-label">{ncr.drawArea}</span>
          </button>

          <div className="sl-ncr-action sl-ncr-action-field">
            <span className="sl-ncr-action-label">{ncr.landUseHistory}</span>
            <textarea
              value={landHistoryNotes}
              onChange={(event) => onLandHistoryNotesChange(event.target.value)}
              rows={3}
            />
          </div>

          <button
            type="button"
            className="sl-ncr-action"
            onClick={onOpenSupportingEvidence}
          >
            <span className="sl-ncr-action-label">{ncr.supportingEvidence}</span>
            <span className="sl-ncr-action-meta">{recordsAvailableCount}</span>
          </button>

          <div className="sl-ncr-action sl-ncr-action-readonly">
            <span className="sl-ncr-action-label">{ncr.estimatedArea}</span>
            <span className="sl-ncr-action-value">
              {polygon
                ? [
                    formatAreaDisplay(polygon.areaM2, "m2", language),
                    formatAreaDisplay(polygon.areaM2, "ha", language),
                    formatAreaDisplay(polygon.areaM2, "acre", language),
                  ]
                    .map((area) => `${area.text} ${area.symbol}`)
                    .join(" · ")
                : "—"}
            </span>
          </div>

          <button type="button" className="sl-ncr-action is-primary" onClick={onOpenPlansExport}>
            <span className="sl-ncr-action-label">{ncr.generateRecord}</span>
          </button>

          <button type="button" className="sl-ncr-action" onClick={onRequestReview}>
            <span className="sl-ncr-action-label">{ncr.requestReview}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
