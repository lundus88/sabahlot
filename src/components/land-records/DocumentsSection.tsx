"use client";

// Sprint documents cloud write UI wiring: mandatory list/preview UI for
// pending + synced documents (filename, document type, size, and
// per-item sync status). Rendered inside the "Lot Information" drawer
// (src/app/page.tsx's `sl-lot-drawer`), immediately after the party
// identity fields section, per the sprint brief.
//
// Local file picking only -- the actual upload happens during Save via
// documents-ui-sync.ts's syncPendingDocumentsToCloud, called from
// page.tsx's save flow after parties (parent -> geometry -> points ->
// parties -> documents). This component never talks to Supabase
// directly.

import { useRef, type ChangeEvent } from "react";

import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_SIZE_BYTES,
  DOCUMENT_TYPE_VALUES,
  type CloudDocumentType,
} from "@/lib/land-records/documents-validation";
import type { DocumentUiSyncResult } from "@/lib/land-records/documents-ui-sync";

export interface PendingDocumentEntry {
  id: string;
  file: File;
  documentType: CloudDocumentType;
}

export interface DocumentsSectionProps {
  pendingDocuments: PendingDocumentEntry[];
  onAdd: (entry: PendingDocumentEntry) => void;
  onRemove: (id: string) => void;
  onDocumentTypeChange: (id: string, documentType: CloudDocumentType) => void;
  syncResults: DocumentUiSyncResult[];
  onFileRejected?: (message: string) => void;
}

const DOCUMENT_TYPE_LABELS: Record<CloudDocumentType, string> = {
  title_deed: "Title deed",
  official_receipt: "Official receipt",
  application_letter: "Application letter",
  plan_or_sketch: "Plan / sketch",
  site_photo: "Site photo",
  pdf_plan_export: "PDF plan export",
  kml_export: "KML export",
  dxf_export: "DXF export",
  other: "Other",
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusLabel(status: DocumentUiSyncResult["status"] | undefined): string {
  switch (status) {
    case "documents_synced":
      return "Synced";
    case "local_only":
      return "Not yet saved";
    case "duplicate_conflict":
      return "Out of sync (changed elsewhere)";
    case "invalid_input":
      return "Invalid";
    case "network_error":
      return "Network error";
    case "failed":
      return "Failed";
    default:
      return "Pending save";
  }
}

export default function DocumentsSection({
  pendingDocuments,
  onAdd,
  onRemove,
  onDocumentTypeChange,
  syncResults,
  onFileRejected,
}: DocumentsSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resultById = new Map(syncResults.map((result) => [result.id, result]));

  const handleFileSelected = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!(DOCUMENT_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      onFileRejected?.(
        `File type "${file.type}" is not supported. Allowed: image (JPEG/PNG/WEBP/HEIC) or PDF.`,
      );
      return;
    }
    if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
      onFileRejected?.(
        `File exceeds the ${DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024)}MB limit.`,
      );
      return;
    }

    onAdd({
      id: crypto.randomUUID(),
      file,
      documentType: "other",
    });
  };

  return (
    <section className="sl-record-section sl-documents-section">
      <h2 className="sl-documents-heading">Documents</h2>
      <p className="sl-record-section-hint">
        Attach supporting documents (title deed, receipt, plan, site photo).
        Uploaded automatically when you Save. Preliminary reference only --
        avoid sensitive personal information.
      </p>

      <button
        type="button"
        className="sl-documents-add-button"
        onClick={() => fileInputRef.current?.click()}
      >
        + Add document
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={DOCUMENT_ALLOWED_MIME_TYPES.join(",")}
        onChange={handleFileSelected}
        style={{ display: "none" }}
      />

      {pendingDocuments.length === 0 ? (
        <p className="sl-record-section-hint">No documents added yet.</p>
      ) : (
        <ul className="sl-documents-list">
          {pendingDocuments.map((doc) => {
            const result = resultById.get(doc.id);
            return (
              <li key={doc.id} className="sl-documents-list-item">
                <div className="sl-documents-list-item-main">
                  <strong>{doc.file.name}</strong>
                  <span>{formatFileSize(doc.file.size)}</span>
                </div>

                <select
                  aria-label="Document type"
                  value={doc.documentType}
                  onChange={(event) =>
                    onDocumentTypeChange(doc.id, event.target.value as CloudDocumentType)
                  }
                >
                  {DOCUMENT_TYPE_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {DOCUMENT_TYPE_LABELS[value]}
                    </option>
                  ))}
                </select>

                <span
                  className={`sl-documents-status sl-documents-status-${result?.status ?? "idle"}`}
                >
                  {statusLabel(result?.status)}
                </span>

                <button
                  type="button"
                  className="sl-icon-button sl-documents-remove-button"
                  onClick={() => onRemove(doc.id)}
                  aria-label="Remove document"
                >
                  {"×"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
