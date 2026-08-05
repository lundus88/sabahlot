import type { FeedbackEntry } from "@/lib/feedback/feedbackStorage";

const CSV_COLUMNS: ReadonlyArray<readonly [keyof FeedbackEntry, string]> = [
  ["submittedAt", "Tarikh/Masa"],
  ["nama", "Nama"],
  ["telefon", "No. Telefon / WhatsApp"],
  ["lokasiUjian", "Lokasi ujian"],
  ["jenisTelefon", "Jenis telefon"],
  ["browser", "Browser"],
  ["fungsiDiuji", "Fungsi diuji"],
  ["region", "Wilayah/Region"],
  ["state", "Negeri/State"],
  ["district", "Daerah/District"],
  ["module", "Modul/Module"],
  ["jenisIsu", "Jenis isu"],
  ["penerangan", "Penerangan masalah"],
  ["cadangan", "Cadangan"],
  ["screenshotNote", "Screenshot note / link"],
];

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

export function buildFeedbackCsv(entries: FeedbackEntry[]): string {
  const header = CSV_COLUMNS.map(([, label]) => escapeCsvValue(label)).join(
    ",",
  );

  const rows = entries.map((entry) =>
    CSV_COLUMNS.map(([key]) => escapeCsvValue(String(entry[key] ?? ""))).join(
      ",",
    ),
  );

  return [header, ...rows].join("\r\n");
}

export function downloadFeedbackCsv(entries: FeedbackEntry[]): void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }

  const csv = buildFeedbackCsv(entries);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  link.href = url;
  link.download = `sabahlot-alpha-feedback-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
