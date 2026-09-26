"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          "expired-callback": () => void;
          "error-callback": () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstile(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("browser_required"));
  }
  if (window.turnstile) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-sabahlot-turnstile="true"]',
    );
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("turnstile_load_failed")), {
        once: true,
      });
      return;
    }

    const script = document.createElement("script");
    script.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.sabahlotTurnstile = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile_load_failed"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  onUnavailable: () => void;
}

export default function TurnstileWidget({
  siteKey,
  action,
  onToken,
  onUnavailable,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let widgetId: string | null = null;

    void loadTurnstile()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) {
          return;
        }
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token) => {
            if (!cancelled) onToken(token);
          },
          "expired-callback": () => {
            if (!cancelled) onToken("");
          },
          "error-callback": () => {
            if (!cancelled) {
              onToken("");
              onUnavailable();
            }
          },
        });
      })
      .catch(() => {
        if (!cancelled) onUnavailable();
      });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, [action, onToken, onUnavailable, siteKey]);

  return <div className="sl-turnstile-widget" ref={containerRef} />;
}
