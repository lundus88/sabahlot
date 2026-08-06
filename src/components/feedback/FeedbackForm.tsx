"use client";

import { useState } from "react";

import FeedbackModal from "@/components/feedback/FeedbackModal";

export default function FeedbackForm() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="sl-beta-action-button"
        onClick={() => setOpen(true)}
      >
        Feedback Alpha
      </button>

      <FeedbackModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
