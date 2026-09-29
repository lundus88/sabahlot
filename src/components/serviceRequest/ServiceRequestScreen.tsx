"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { Icon } from "@/app/components/Map";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import {
  getLeadHandoffConfig,
  submitProfessionalHelp,
  type ProfessionalHelpContext,
} from "@/lib/lead-handoff";
import TurnstileWidget from "./TurnstileWidget";

const COPY = {
  en: {
    title: "Get Professional Help",
    body: "Share only the details needed for a professional to understand your land matter and contact you.",
    name: "Name",
    email: "Email",
    phone: "Phone / WhatsApp (optional)",
    service: "What do you need help with?",
    serviceOptions: [
      ["land_application", "Land application"],
      ["boundary_survey", "Boundary / survey"],
      ["subdivision", "Subdivision"],
      ["ncr", "NCR / customary land"],
      ["documents", "Document preparation"],
      ["unsure", "I'm not sure"],
    ] as const,
    message: "Briefly describe what you need",
    contextTitle: "Land context that will be shared",
    contextEmpty: "No land context has been added yet.",
    consent:
      "I agree for SabahLot to send the information shown here to LundusLead so a professional can contact me.",
    privacy:
      "SabahLot does not send your uploaded files, identity numbers, or exact boundary coordinates through this handoff.",
    submit: "Send My Land Details",
    submitting: "Sending...",
    success: "Your request has been sent. A professional can now follow up with you.",
    duplicate: "This request was already received. No duplicate lead was created.",
    unavailable:
      "Professional handoff is not configured in this environment yet. Your information has not been sent.",
    failed: "The request could not be sent. Please try again later.",
    close: "Close",
    required: "Please complete the required fields, consent, and verification.",
    verification: "Security verification",
  },
  ms: {
    title: "Dapatkan Bantuan Profesional",
    body: "Kongsi hanya maklumat yang diperlukan supaya profesional memahami urusan tanah anda dan boleh menghubungi anda.",
    name: "Nama",
    email: "E-mel",
    phone: "Telefon / WhatsApp (pilihan)",
    service: "Apakah bantuan yang anda perlukan?",
    serviceOptions: [
      ["land_application", "Permohonan tanah"],
      ["boundary_survey", "Sempadan / ukur"],
      ["subdivision", "Pecah bahagian / pecah lot"],
      ["ncr", "NCR / tanah adat"],
      ["documents", "Penyediaan dokumen"],
      ["unsure", "Saya tidak pasti"],
    ] as const,
    message: "Terangkan secara ringkas bantuan yang diperlukan",
    contextTitle: "Konteks tanah yang akan dikongsi",
    contextEmpty: "Belum ada konteks tanah ditambah.",
    consent:
      "Saya bersetuju SabahLot menghantar maklumat yang dipaparkan di sini kepada LundusLead supaya profesional boleh menghubungi saya.",
    privacy:
      "SabahLot tidak menghantar fail yang dimuat naik, nombor pengenalan atau koordinat sempadan tepat melalui handoff ini.",
    submit: "Hantar Maklumat Tanah Saya",
    submitting: "Menghantar...",
    success: "Permintaan anda telah dihantar. Profesional boleh membuat susulan.",
    duplicate: "Permintaan ini telah diterima sebelum ini. Tiada lead pendua dicipta.",
    unavailable:
      "Handoff profesional belum dikonfigurasi dalam persekitaran ini. Maklumat anda belum dihantar.",
    failed: "Permintaan tidak dapat dihantar. Sila cuba lagi kemudian.",
    close: "Tutup",
    required: "Lengkapkan medan wajib, persetujuan dan pengesahan keselamatan.",
    verification: "Pengesahan keselamatan",
  },
} as const;

export interface ServiceRequestScreenProps {
  open: boolean;
  onClose: () => void;
  language: AppLanguage;
  context: ProfessionalHelpContext;
}

function describeContext(context: ProfessionalHelpContext, language: AppLanguage) {
  const labels: string[] = [];

  if (context.landCaseType) {
    labels.push(
      language === "ms"
        ? `Jenis urusan: ${context.landCaseType}`
        : `Land matter: ${context.landCaseType}`,
    );
  }
  if (context.district) {
    labels.push(
      language === "ms"
        ? `Daerah: ${context.district}`
        : `District: ${context.district}`,
    );
  }
  if (context.village) {
    labels.push(
      language === "ms"
        ? `Kampung: ${context.village}`
        : `Village: ${context.village}`,
    );
  }
  if (context.estimatedAreaM2) {
    labels.push(
      language === "ms"
        ? `Anggaran keluasan: ${context.estimatedAreaM2.toFixed(2)} m²`
        : `Estimated area: ${context.estimatedAreaM2.toFixed(2)} m²`,
    );
  }
  if (context.issueTags.length) {
    labels.push(
      language === "ms"
        ? `Isu: ${context.issueTags.join(", ")}`
        : `Issues: ${context.issueTags.join(", ")}`,
    );
  }
  if (context.documentTypes.length) {
    labels.push(
      language === "ms"
        ? `Jenis dokumen tersedia: ${context.documentTypes.join(", ")}`
        : `Document types available: ${context.documentTypes.join(", ")}`,
    );
  }

  return labels;
}

export default function ServiceRequestScreen({
  open,
  onClose,
  language,
  context,
}: ServiceRequestScreenProps) {
  const copy = language === "ms" ? COPY.ms : COPY.en;
  const config = useMemo(() => getLeadHandoffConfig(), []);
  const [submissionId, setSubmissionId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [service, setService] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "duplicate" | "unavailable" | "failed" | "required"
  >("idle");

  useEffect(() => {
    if (!open) return;

    queueMicrotask(() => {
      setSubmissionId(
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "",
      );
      setName("");
      setEmail("");
      setPhone("");
      setService("");
      setMessage("");
      setConsent(false);
      setTurnstileToken("");
      setVerificationUnavailable(false);
      setStatus("idle");
    });
  }, [open]);

  const handleToken = useCallback((token: string) => {
    setTurnstileToken(token);
    if (token) setVerificationUnavailable(false);
  }, []);

  const handleVerificationUnavailable = useCallback(() => {
    setVerificationUnavailable(true);
  }, []);

  if (!open) {
    return null;
  }

  const contextLines = describeContext(context, language);
  const integrationConfigured = Boolean(
    config.endpoint && config.turnstileSiteKey,
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !submissionId ||
      !name.trim() ||
      !email.trim() ||
      !service ||
      !message.trim() ||
      !consent ||
      !turnstileToken
    ) {
      setStatus("required");
      return;
    }

    setStatus("submitting");

    const result = await submitProfessionalHelp({
      submissionId,
      name,
      email,
      phone,
      service,
      message,
      consentToContact: consent,
      turnstileToken,
      context,
    });

    if (result.ok) {
      setStatus(result.duplicate ? "duplicate" : "success");
      return;
    }

    setStatus(result.code === "not_configured" ? "unavailable" : "failed");
  };

  const statusMessage =
    status === "success"
      ? copy.success
      : status === "duplicate"
        ? copy.duplicate
        : status === "unavailable"
          ? copy.unavailable
          : status === "required"
            ? copy.required
            : status === "failed"
              ? copy.failed
              : verificationUnavailable
                ? copy.failed
                : null;

  return (
    <div className="sl-ncr-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sl-service-request-screen sl-professional-help-screen"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-service-request-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sl-ncr-header">
          <div>
            <span className="sl-professional-help-eyebrow">SabahLot → LundusLead</span>
            <h2 id="sl-service-request-title">{copy.title}</h2>
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
        </div>

        <p className="sl-service-request-body">{copy.body}</p>

        {!integrationConfigured ? (
          <div className="sl-professional-help-notice" role="status">
            {copy.unavailable}
          </div>
        ) : (
          <form className="sl-professional-help-form" onSubmit={handleSubmit}>
            <div className="sl-professional-help-grid">
              <label>
                <span>{copy.name}</span>
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={140}
                  required
                />
              </label>

              <label>
                <span>{copy.email}</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  maxLength={254}
                  required
                />
              </label>
            </div>

            <label>
              <span>{copy.phone}</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                autoComplete="tel"
                maxLength={32}
              />
            </label>

            <label>
              <span>{copy.service}</span>
              <select
                value={service}
                onChange={(event) => setService(event.target.value)}
                required
              >
                <option value="">—</option>
                {copy.serviceOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>{copy.message}</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={3500}
                rows={4}
                required
              />
            </label>

            <div className="sl-professional-help-context">
              <strong>{copy.contextTitle}</strong>
              {contextLines.length ? (
                <ul>
                  {contextLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>{copy.contextEmpty}</p>
              )}
            </div>

            <label className="sl-professional-help-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                required
              />
              <span>{copy.consent}</span>
            </label>

            <p className="sl-professional-help-privacy">{copy.privacy}</p>

            <div className="sl-professional-help-verification">
              <strong>{copy.verification}</strong>
              <TurnstileWidget
                siteKey={config.turnstileSiteKey!}
                action={config.turnstileAction}
                onToken={handleToken}
                onUnavailable={handleVerificationUnavailable}
              />
            </div>

            {statusMessage && (
              <div
                className={`sl-professional-help-status is-${status}`}
                role="status"
              >
                {statusMessage}
              </div>
            )}

            {status !== "success" && status !== "duplicate" && (
              <button
                type="submit"
                className="sl-ncr-action is-primary"
                disabled={status === "submitting"}
              >
                <span className="sl-ncr-action-label">
                  {status === "submitting" ? copy.submitting : copy.submit}
                </span>
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
