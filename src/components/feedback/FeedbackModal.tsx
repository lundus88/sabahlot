"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  saveFeedbackEntry,
  type FeedbackEntryInput,
  type FeedbackIssueType,
} from "@/lib/feedback/feedbackStorage";

const ISSUE_TYPES: FeedbackIssueType[] = [
  "Critical",
  "Major",
  "Minor",
  "Suggestion",
];

const EMPTY_FORM: FeedbackEntryInput = {
  nama: "",
  telefon: "",
  lokasiUjian: "",
  jenisTelefon: "",
  browser: "",
  fungsiDiuji: "",
  jenisIsu: "Minor",
  penerangan: "",
  cadangan: "",
  screenshotNote: "",
};

export interface FeedbackModalProps {
  open: boolean;
  title?: string;
  initialValues?: Partial<FeedbackEntryInput>;
  onClose: () => void;
  onSaved?: () => void;
}

export default function FeedbackModal({
  open,
  title = "Feedback Beta SabahLot",
  initialValues,
  onClose,
  onSaved,
}: FeedbackModalProps) {
  const [form, setForm] = useState<FeedbackEntryInput>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    queueMicrotask(() => {
      setForm({
        ...EMPTY_FORM,
        browser:
          typeof navigator !== "undefined" ? navigator.userAgent : "",
        ...initialValues,
      });
      setSubmitted(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) {
    return null;
  }

  const updateField = (
    field: keyof FeedbackEntryInput,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    saveFeedbackEntry(form);
    setSubmitted(true);
    onSaved?.();
  };

  return (
    <div className="sl-feedback-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sl-feedback-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-feedback-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sl-feedback-header">
          <h2 id="sl-feedback-title">{title}</h2>
          <button
            type="button"
            className="sl-feedback-close"
            onClick={onClose}
            aria-label="Tutup"
          >
            ×
          </button>
        </div>

        {submitted ? (
          <div className="sl-feedback-success">
            <p>Terima kasih! Maklum balas anda telah disimpan pada peranti ini.</p>
            <button type="button" onClick={onClose}>
              Tutup
            </button>
          </div>
        ) : (
          <form className="sl-feedback-form" onSubmit={handleSubmit}>
            <label>
              <span>Nama</span>
              <input
                type="text"
                value={form.nama}
                onChange={(event) => updateField("nama", event.target.value)}
              />
            </label>

            <label>
              <span>No. Telefon / WhatsApp</span>
              <input
                type="text"
                value={form.telefon}
                onChange={(event) =>
                  updateField("telefon", event.target.value)
                }
              />
            </label>

            <label>
              <span>Lokasi ujian</span>
              <input
                type="text"
                value={form.lokasiUjian}
                onChange={(event) =>
                  updateField("lokasiUjian", event.target.value)
                }
              />
            </label>

            <label>
              <span>Jenis telefon</span>
              <input
                type="text"
                value={form.jenisTelefon}
                onChange={(event) =>
                  updateField("jenisTelefon", event.target.value)
                }
              />
            </label>

            <label>
              <span>Browser</span>
              <input
                type="text"
                value={form.browser}
                onChange={(event) =>
                  updateField("browser", event.target.value)
                }
              />
            </label>

            <label>
              <span>Fungsi diuji</span>
              <input
                type="text"
                placeholder="Contoh: Mark Point, Import KML, AR Guide"
                value={form.fungsiDiuji}
                onChange={(event) =>
                  updateField("fungsiDiuji", event.target.value)
                }
              />
            </label>

            <label>
              <span>Jenis isu</span>
              <select
                value={form.jenisIsu}
                onChange={(event) =>
                  updateField(
                    "jenisIsu",
                    event.target.value as FeedbackIssueType,
                  )
                }
              >
                {ISSUE_TYPES.map((issueType) => (
                  <option key={issueType} value={issueType}>
                    {issueType}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Penerangan masalah</span>
              <textarea
                value={form.penerangan}
                onChange={(event) =>
                  updateField("penerangan", event.target.value)
                }
              />
            </label>

            <label>
              <span>Cadangan</span>
              <textarea
                value={form.cadangan}
                onChange={(event) =>
                  updateField("cadangan", event.target.value)
                }
              />
            </label>

            <label>
              <span>Screenshot note / link (pilihan)</span>
              <input
                type="text"
                value={form.screenshotNote}
                onChange={(event) =>
                  updateField("screenshotNote", event.target.value)
                }
              />
            </label>

            <p className="sl-feedback-note">
              Maklum balas disimpan pada peranti ini sahaja (localStorage).
            </p>

            <button type="submit" className="sl-feedback-submit">
              Hantar Maklum Balas
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
