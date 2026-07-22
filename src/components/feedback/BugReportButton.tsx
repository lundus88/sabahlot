"use client";

import { useState } from "react";

import FeedbackModal from "@/components/feedback/FeedbackModal";
import type { FeedbackEntryInput } from "@/lib/feedback/feedbackStorage";
import { readFieldAssistActiveTarget } from "@/lib/field-assist-active-target";
import { useAppBrandLabel } from "@/lib/branding/appBrandLabel";

function getGpsAccuracyText(): Promise<string> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve("Tidak tersedia");
      return;
    }

    const timeoutId = window.setTimeout(() => {
      resolve("Tidak tersedia (masa tamat)");
    }, 4000);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.clearTimeout(timeoutId);
        resolve(`+/-${position.coords.accuracy.toFixed(1)} m`);
      },
      () => {
        window.clearTimeout(timeoutId);
        resolve("Tidak tersedia");
      },
      {
        enableHighAccuracy: true,
        timeout: 4000,
        maximumAge: 30000,
      },
    );
  });
}

async function buildDiagnosticsText(): Promise<string> {
  const timestamp = new Date().toISOString();
  const url = window.location.href;
  const userAgent = navigator.userAgent;
  const screenSize = `${window.screen.width}x${window.screen.height}`;
  const activeTarget = readFieldAssistActiveTarget();
  const accuracy = await getGpsAccuracyText();

  return [
    `Masa: ${timestamp}`,
    `URL: ${url}`,
    `Peranti/Browser: ${userAgent}`,
    `Saiz skrin: ${screenSize}`,
    `Ketepatan GPS: ${accuracy}`,
    `Sasaran aktif: ${activeTarget?.label ?? "Tiada sasaran aktif"}`,
    "",
    "Penerangan tambahan:",
    "",
  ].join("\n");
}

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [initialValues, setInitialValues] = useState<
    Partial<FeedbackEntryInput> | undefined
  >(undefined);
  const reportTitle = useAppBrandLabel("Report Issue — SabahLot Alpha");

  const handleClick = async () => {
    setLoading(true);

    try {
      const diagnostics = await buildDiagnosticsText();

      setInitialValues({
        jenisIsu: "Major",
        fungsiDiuji: "Report Issue (auto)",
        penerangan: diagnostics,
      });
      setOpen(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="sl-beta-action-button"
        onClick={() => {
          void handleClick();
        }}
        disabled={loading}
      >
        {loading ? "Menyediakan..." : "Report Issue"}
      </button>

      <FeedbackModal
        open={open}
        title={reportTitle}
        initialValues={initialValues}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
