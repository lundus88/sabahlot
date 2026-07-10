"use client";

import { useRef, type ReactNode, type TouchEvent as ReactTouchEvent } from "react";

import { Icon } from "@/app/components/Map";
import type { AppMode } from "@/lib/appMode/appModeStorage";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText, MODULE_ORDER, type ModuleId } from "@/lib/i18n/appText";
import ModeToggle from "@/components/shell/ModeToggle";

const MODULE_ICON_PATHS: Record<ModuleId, ReactNode> = {
  ncr: (
    <>
      <path d="M4 21V9l8-6 8 6v12" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  land_management: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="1.5" />
      <path d="M3 11h18" />
    </>
  ),
  map_drawing: (
    <>
      <path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3Z" />
      <path d="M9 3v15M15 6v15" />
    </>
  ),
  field_work: (
    <>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
    </>
  ),
  plans_export: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M9 13h6M9 17h6" />
    </>
  ),
  service_request: <path d="M4 4h16v12H8l-4 4Z" />,
  help_guide: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.9.4-1.5 1-1.5 2.2M12 17h.01" />
    </>
  ),
  feedback: <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />,
  advanced_mode: (
    <>
      <path d="M4 6h10M4 18h6" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="14" cy="18" r="2" />
      <path d="M4 12h6" />
    </>
  ),
};

const EDGE_SWIPE_OPEN_THRESHOLD = 40;
const SWIPE_CLOSE_THRESHOLD = 60;
const SWIPE_MAX_VERTICAL_DRIFT = 40;

export interface CategoryDrawerProps {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  language: AppLanguage;
  appMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  onSelectCategory: (id: ModuleId) => void;
}

export default function CategoryDrawer({
  open,
  onOpen,
  onClose,
  language,
  appMode,
  onModeChange,
  onSelectCategory,
}: CategoryDrawerProps) {
  const text = getAppText(language);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleEdgeTouchStart = (event: ReactTouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handleEdgeTouchMove = (event: ReactTouchEvent) => {
    if (touchStartX.current === null) {
      return;
    }
    const currentX = event.touches[0]?.clientX ?? touchStartX.current;
    const currentY = event.touches[0]?.clientY ?? touchStartY.current ?? 0;
    const dx = currentX - touchStartX.current;
    const dy = Math.abs(currentY - (touchStartY.current ?? 0));

    if (dx > EDGE_SWIPE_OPEN_THRESHOLD && dy < SWIPE_MAX_VERTICAL_DRIFT) {
      onOpen();
      touchStartX.current = null;
    }
  };

  const handlePanelTouchStart = (event: ReactTouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
    touchStartY.current = event.touches[0]?.clientY ?? null;
  };

  const handlePanelTouchMove = (event: ReactTouchEvent) => {
    if (touchStartX.current === null) {
      return;
    }
    const currentX = event.touches[0]?.clientX ?? touchStartX.current;
    const currentY = event.touches[0]?.clientY ?? touchStartY.current ?? 0;
    const dx = touchStartX.current - currentX;
    const dy = Math.abs(currentY - (touchStartY.current ?? 0));

    if (dx > SWIPE_CLOSE_THRESHOLD && dy < SWIPE_MAX_VERTICAL_DRIFT) {
      onClose();
      touchStartX.current = null;
    }
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          className="sl-drawer-handle"
          onClick={onOpen}
          onTouchStart={handleEdgeTouchStart}
          onTouchMove={handleEdgeTouchMove}
          aria-label={text.menuButton}
          title={text.menuButton}
        >
          <span className="sl-drawer-handle-bar" />
        </button>
      )}

      {open && (
        <div
          className="sl-category-drawer-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`sl-category-drawer ${open ? "is-open" : ""}`}
        onTouchStart={handlePanelTouchStart}
        onTouchMove={handlePanelTouchMove}
        aria-hidden={!open}
      >
        <div className="sl-category-drawer-header">
          <span className="sl-category-drawer-brand">
            {text.brand}
          </span>
          <button
            type="button"
            className="sl-icon-button"
            onClick={onClose}
            aria-label={text.ncrScreen.close}
          >
            <Icon>
              <path d="M6 6l12 12M18 6 6 18" />
            </Icon>
          </button>
        </div>

        <nav className="sl-category-list">
          {MODULE_ORDER.map((id) => {
            const navModule = text.modules[id];

            if (id === "advanced_mode") {
              return (
                <div
                  key={id}
                  className="sl-category-item sl-category-item-mode"
                >
                  <div className="sl-category-item-icon">
                    <Icon>{MODULE_ICON_PATHS[id]}</Icon>
                  </div>
                  <div className="sl-category-item-copy">
                    <span className="sl-category-item-label">
                      {navModule.label}
                    </span>
                    <span className="sl-category-item-description">
                      {navModule.description}
                    </span>
                  </div>
                  <ModeToggle
                    mode={appMode}
                    onModeChange={onModeChange}
                    language={language}
                  />
                </div>
              );
            }

            return (
              <button
                key={id}
                type="button"
                className={`sl-category-item ${
                  id === "ncr" ? "is-primary" : ""
                }`}
                onClick={() => onSelectCategory(id)}
              >
                <div className="sl-category-item-icon">
                  <Icon>{MODULE_ICON_PATHS[id]}</Icon>
                </div>
                <div className="sl-category-item-copy">
                  <span className="sl-category-item-label">
                    {navModule.label}
                  </span>
                  <span className="sl-category-item-description">
                    {navModule.description}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
