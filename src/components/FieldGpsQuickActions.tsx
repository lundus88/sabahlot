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
  sectionKey: string;
  icon: typeof MapPin;
  tint: string;
  iconColor: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "mark",
    label: "Mark",
    sectionKey: "sl-field-gps-capture-section",
    icon: MapPin,
    tint: "#0F6E56",
    iconColor: "#9FE1CB",
  },
  {
    id: "navigate",
    label: "Nav",
    sectionKey: "sl-field-gps-target-section",
    icon: Navigation,
    tint: "#3B6D11",
    iconColor: "#C0DD97",
  },
  {
    id: "ar-guide",
    label: "AR",
    sectionKey: "sl-field-gps-target-section",
    icon: Video,
    tint: "#3B6D11",
    iconColor: "#C0DD97",
  },
  {
    id: "inverse",
    label: "Inv",
    sectionKey: "sl-field-gps-inverse-section",
    icon: Ruler,
    tint: "#3C3489",
    iconColor: "#CECBF6",
  },
  {
    id: "import",
    label: "In",
    sectionKey: "sl-field-gps-points-section",
    icon: FileUp,
    tint: "#0C447C",
    iconColor: "#85B7EB",
  },
  {
    id: "export",
    label: "Out",
    sectionKey: "sl-field-gps-capture-section",
    icon: FileDown,
    tint: "#854F0B",
    iconColor: "#FAC775",
  },
];

interface FieldGpsQuickActionsProps {
  activeSection: string | null;
  onSelect: (sectionKey: string) => void;
}

export default function FieldGpsQuickActions({
  activeSection,
  onSelect,
}: FieldGpsQuickActionsProps) {
  return (
    <div className="sl-gps-icon-rail">
      {QUICK_ACTIONS.map((action) => {
        const Icon = action.icon;
        const isActive =
          activeSection === action.sectionKey;

        return (
          <button
            key={action.id}
            type="button"
            className={
              isActive
                ? "sl-gps-rail-tile sl-gps-rail-tile-active"
                : "sl-gps-rail-tile"
            }
            onClick={() =>
              onSelect(action.sectionKey)
            }
            aria-label={action.label}
          >
            <span
              className="sl-gps-rail-icon"
              style={{ background: action.tint }}
            >
              <Icon
                size={16}
                color={action.iconColor}
                aria-hidden="true"
              />
            </span>
            <span className="sl-gps-rail-label">
              {action.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
