"use client";

import { downloadFeedbackCsv } from "@/lib/feedback/exportFeedbackCsv";
import { getFeedbackEntries } from "@/lib/feedback/feedbackStorage";

export default function FeedbackExportButton() {
  const handleExport = () => {
    const entries = getFeedbackEntries();

    if (entries.length === 0) {
      window.alert("Tiada maklum balas tersimpan pada peranti ini.");
      return;
    }

    downloadFeedbackCsv(entries);
  };

  return (
    <button
      type="button"
      className="sl-beta-action-button"
      onClick={handleExport}
    >
      Eksport Feedback CSV
    </button>
  );
}
