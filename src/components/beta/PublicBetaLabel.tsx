"use client";

import { useEffect, useState } from "react";

const ALPHA_BANNER_STORAGE_KEY = "sabahlot_alpha_field_banner_v1";

export default function PublicBetaLabel() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(ALPHA_BANNER_STORAGE_KEY) === "dismissed";
      if (dismissed) {
        queueMicrotask(() => setVisible(false));
      }
    } catch {
      // Storage may be unavailable in privacy-restricted browsers.
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.slNoticeVisible = visible ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.slNoticeVisible;
    };
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div className="sl-public-beta-label" aria-live="off">
      <span>Controlled Alpha</span>
      <button
        type="button"
        onClick={() => {
          try {
            window.localStorage.setItem(ALPHA_BANNER_STORAGE_KEY, "dismissed");
          } catch {
            // Dismiss for this session even when storage is unavailable.
          }
          setVisible(false);
        }}
        aria-label="Dismiss Controlled Alpha notice"
      >
        ×
      </button>
    </div>
  );
}
