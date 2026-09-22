"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const AR_ROUTE = "/ar-stakeout";
const MAP_ROUTE = "/";

function buttonText(button: HTMLButtonElement) {
  return (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export default function GpsResumeBridge() {
  const pathname = usePathname();
  const previousPathRef = useRef<string | null>(null);

  useEffect(() => {
    const previousPath = previousPathRef.current;
    previousPathRef.current = pathname;

    if (previousPath !== AR_ROUTE || pathname !== MAP_ROUTE) {
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let retryId: number | null = null;

    const closeGpsPanel = () => {
      window.setTimeout(() => {
        if (cancelled) return;
        const closeButton = document.querySelector<HTMLButtonElement>(
          ".sl-field-gps-card .sl-field-gps-close",
        );
        closeButton?.click();
      }, 300);
    };

    const resumeGps = () => {
      if (cancelled) return;
      attempts += 1;

      const toggle = document.querySelector<HTMLButtonElement>(
        ".sl-field-gps-toggle",
      );

      if (!toggle) {
        if (attempts < 30) {
          retryId = window.setTimeout(resumeGps, 150);
        }
        return;
      }

      let card = document.querySelector<HTMLElement>(".sl-field-gps-card");
      if (!card) {
        toggle.click();
        card = document.querySelector<HTMLElement>(".sl-field-gps-card");
      }

      if (!card) {
        if (attempts < 30) {
          retryId = window.setTimeout(resumeGps, 150);
        }
        return;
      }

      const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>("button"));
      const stopButton = buttons.find((button) => buttonText(button).includes("stop gps"));

      if (stopButton) {
        closeGpsPanel();
        return;
      }

      const startButton = buttons.find((button) => buttonText(button).includes("start gps"));

      if (startButton) {
        startButton.click();
        closeGpsPanel();
        return;
      }

      if (attempts < 30) {
        retryId = window.setTimeout(resumeGps, 150);
      }
    };

    retryId = window.setTimeout(resumeGps, 0);

    return () => {
      cancelled = true;
      if (retryId !== null) {
        window.clearTimeout(retryId);
      }
    };
  }, [pathname]);

  return null;
}
