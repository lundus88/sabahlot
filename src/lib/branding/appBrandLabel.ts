"use client";

import { useSyncExternalStore } from "react";

const ALPHA_HOSTNAME = "alpha.sabahlot.com";

export function isAlphaHostname(hostname: string): boolean {
  return hostname === ALPHA_HOSTNAME;
}

export function applyAlphaBrand(label: string): string {
  return label.replace(/Beta/g, "Alpha").replace(/beta/g, "alpha");
}

function subscribe(): () => void {
  return () => {};
}

function getHostnameSnapshot(): string {
  return window.location.hostname;
}

function getServerHostnameSnapshot(): string {
  return "";
}

export function useIsAlphaDomain(): boolean {
  const hostname = useSyncExternalStore(
    subscribe,
    getHostnameSnapshot,
    getServerHostnameSnapshot,
  );

  return isAlphaHostname(hostname);
}

export function useAppBrandLabel(defaultLabel: string): string {
  const isAlpha = useIsAlphaDomain();

  return isAlpha ? applyAlphaBrand(defaultLabel) : defaultLabel;
}
