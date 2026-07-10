"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { AppMode } from "@/lib/appMode/appModeStorage";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import type { RegionId } from "@/lib/region/regionStorage";

export interface AppShellState {
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
  region: RegionId;
  setRegion: (region: RegionId) => void;
}

const AppShellContext = createContext<AppShellState | null>(null);

export function AppShellProvider({
  value,
  children,
}: {
  value: AppShellState;
  children: ReactNode;
}) {
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell(): AppShellState {
  const context = useContext(AppShellContext);
  if (!context) {
    throw new Error("useAppShell must be used within an AppShellProvider");
  }
  return context;
}
