"use client";

import { useEffect, useRef, useState } from "react";

import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText } from "@/lib/i18n/appText";
import {
  REGION_DEFINITIONS,
  REGION_ORDER,
  type RegionId,
} from "@/lib/region/regionStorage";

export default function RegionIndicator({
  region,
  language,
  onRegionChange,
}: {
  region: RegionId;
  language: AppLanguage;
  onRegionChange?: (region: RegionId) => void;
}) {
  const [open, setOpen] = useState(false);
  const text = getAppText(language);
  const current = REGION_DEFINITIONS[region];
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="sl-region-indicator">
      <button
        type="button"
        className="sl-region-pill"
        onClick={() => setOpen((value) => !value)}
        title={text.regionPickerTitle}
        aria-label={text.regionPickerTitle}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls="sl-region-options"
      >
        <span className="sl-region-pill-label">
          {current.label[language]}
        </span>
        {current.status === "controlled_beta" && (
          <span className="sl-region-badge">
            {text.controlledBetaBadge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="sl-region-options"
          className="sl-region-popover"
          role="listbox"
        >
          {REGION_ORDER.map((id) => {
            const definition = REGION_DEFINITIONS[id];
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={id === region}
                className={`sl-region-option ${
                  id === region ? "is-selected" : ""
                }`}
                onClick={() => {
                  onRegionChange?.(id);
                  setOpen(false);
                }}
              >
                <span>{definition.label[language]}</span>
                {definition.status === "controlled_beta" && (
                  <span className="sl-region-badge">
                    {text.controlledBetaBadge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
