"use client";

import { Icon } from "@/app/components/Map";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText } from "@/lib/i18n/appText";

export interface ServiceRequestScreenProps {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  onSendFeedback: () => void;
}

export default function ServiceRequestScreen({
  open,
  onClose,
  language,
  onSendFeedback,
}: ServiceRequestScreenProps) {
  const text = getAppText(language);
  const serviceRequest = text.serviceRequest;

  if (!open) {
    return null;
  }

  return (
    <div className="sl-ncr-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sl-service-request-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-service-request-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sl-ncr-header">
          <h2 id="sl-service-request-title">{serviceRequest.title}</h2>
          <button
            type="button"
            className="sl-icon-button"
            onClick={onClose}
            aria-label={serviceRequest.close}
          >
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <p className="sl-service-request-body">{serviceRequest.body}</p>

        <button
          type="button"
          className="sl-ncr-action is-primary"
          onClick={onSendFeedback}
        >
          <span className="sl-ncr-action-label">{serviceRequest.cta}</span>
        </button>
      </div>
    </div>
  );
}
