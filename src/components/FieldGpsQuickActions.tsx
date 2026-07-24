"use client";

import {
  FileDown,
  FileUp,
  MapPin,
  Navigation,
  Ruler,
  Video,
} from "lucide-react";

interface QuickAction {
  id: string;
  label: string;
  targetElementId: string;
  icon: typeof MapPin;
  tint: string;
  iconColor: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "mark",
    label: "Mark point",
    targetElementId: "sl-field-gps-capture-section",
    icon: MapPin,
    tint: "#0F6E56",
    iconColor: "#9FE1CB",
  },
  {
    id: "navigate",
    label: "Navigate",
    targetElementId: "sl-field-gps-target-section",
    icon: Navigation,
    tint: "#3B6D11",
    iconColor: "#C0DD97",
  },
  {
    id: "ar-guide",
    label: "AR Guide",
    targetElementId: "sl-field-gps-target-section",
    icon: Video,
    tint: "#3B6D11",
    iconColor: "#C0DD97",
  },
  {
    id: "inverse",
    label: "Inverse",
    targetElementId: "sl-field-gps-inverse-section",
    icon: Ruler,
    tint: "#3C3489",
    iconColor: "#CECBF6",
  },
  {
    id: "import",
    label: "Import",
    targetElementId: "sl-field-gps-points-section",
    icon: FileUp,
    tint: "#0C447C",
    iconColor: "#85B7EB",
  },
  {
    id: "export",
    label: "Export",
    targetElementId: "sl-field-gps-capture-section",
    icon: FileDown,
    tint: "#854F0B",
    iconColor: "#FAC775",
  },
];

function scrollToSection(elementId: string) {
  const target = document.getElementById(elementId);

  if (!target) {
    // Section not present yet (e.g. a feature still pending merge) —
    // fail silently rather than error, this is a navigation shortcut,
    // not a required control.
    return;
  }

  target.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export default function FieldGpsQuickActions() {
  return (
    <div className="sl-gps-quick-actions">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;

        return (
          <button
            key={action.id}
            type="button"
            className="sl-gps-quick-action-tile"
            onClick={() =>
              scrollToSection(action.targetElementId)
            }
          >
            <span
              className="sl-gps-quick-action-icon"
              style={{ background: action.tint }}
            >
              <Icon
                size={20}
                color={action.iconColor}
                aria-hidden="true"
              />
            </span>
            <span className="sl-gps-quick-action-label">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
