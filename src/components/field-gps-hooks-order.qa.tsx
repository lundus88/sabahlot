// fix/field-gps-hooks-order QA script for Issue #7 (FieldGpsLite
// Rules-of-Hooks violation on `enabled` toggling). Run via:
//   npx tsc -p src/components/field-gps-hooks-order.qa.tsconfig.json --outDir <tmp>
//   node <tmp>/components/field-gps-hooks-order.qa.js
//
// Renders the REAL FieldGpsLite component through react-dom/client on a
// jsdom DOM (not a static/source-text check) and toggles `enabled`
// repeatedly, the same way the Basic <-> Advanced mode switch in
// page.tsx does. This is the regression test for Issue #7: it fails
// loudly if React ever again reports "change in order of Hooks" for
// this component, and it fails if geolocation/camera APIs are ever
// invoked while `enabled=false` (Basic mode).
//
// Must run BEFORE importing "react"/"react-dom" or FieldGpsLite --
// those read `window`/`document` at module-evaluation time in a
// browser-like environment, so the jsdom globals have to exist first.

import { JSDOM } from "jsdom";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost/",
});

const domWindow = dom.window as unknown as typeof globalThis;

for (const key of Object.getOwnPropertyNames(domWindow)) {
  if (key in globalThis) continue;
  try {
    (globalThis as Record<string, unknown>)[key] = (
      domWindow as unknown as Record<string, unknown>
    )[key];
  } catch {
    // Some jsdom window properties are non-configurable getters on
    // globalThis already (e.g. `self`) -- skip those, the existing
    // Node global is fine.
  }
}

Object.defineProperty(globalThis, "window", {
  value: dom.window,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "document", {
  value: dom.window.document,
  configurable: true,
  writable: true,
});

let geolocationCalls = 0;
let getUserMediaCalls = 0;

const fakeGeolocation: Geolocation = {
  getCurrentPosition: () => {
    geolocationCalls += 1;
  },
  watchPosition: () => {
    geolocationCalls += 1;
    return 1;
  },
  clearWatch: () => {},
} as unknown as Geolocation;

Object.defineProperty(dom.window.navigator, "geolocation", {
  value: fakeGeolocation,
  configurable: true,
});

Object.defineProperty(dom.window.navigator, "mediaDevices", {
  value: {
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      throw new Error("getUserMedia should not be called in this QA script.");
    },
  },
  configurable: true,
});

Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
  writable: true,
});

// ---------------------------------------------------------------------
// Only after the jsdom globals above are installed: import React, the
// real (unmodified) AppRouterContext singleton next/navigation's
// useRouter() reads from, and the real FieldGpsLite component.
// ---------------------------------------------------------------------

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appRouterContextModule = require("next/dist/shared/lib/app-router-context.shared-runtime");

// This script is compiled to plain CommonJS and run directly with
// `node` (same convention as every other .qa.ts in this repo) --
// there is no bundler/tsconfig-paths runtime here to resolve the
// project's `@/*` -> `src/*` alias used throughout FieldGpsLite.tsx's
// own imports, so it is resolved by hand, once, before FieldGpsLite is
// required.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require("node:module");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");
// This script itself lives at `src/components/<this file>` -- tsc
// mirrors that same relative layout under --outDir (since outDir's
// rootDir is inferred as `src/`, the one common ancestor of every file
// this program pulls in). So the compiled tree's own root -- the
// directory that `@/*` must resolve against -- is exactly one level
// above this compiled file's own directory.
const compiledSrcRoot = path.resolve(__dirname, "..");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function patchedResolveFilename(
  request: string,
  ...rest: unknown[]
) {
  if (request.startsWith("@/")) {
    const resolved = path.join(compiledSrcRoot, request.slice(2));
    return originalResolveFilename.call(
      this,
      resolved,
      ...(rest as [unknown, unknown, unknown]),
    );
  }
  return originalResolveFilename.call(
    this,
    request,
    ...(rest as [unknown, unknown, unknown]),
  );
};

import FieldGpsLite from "./FieldGpsLite";

const { AppRouterContext } = appRouterContextModule as {
  AppRouterContext: React.Context<unknown>;
};

const fakeRouter = {
  back: () => {},
  forward: () => {},
  refresh: () => {},
  push: () => {},
  replace: () => {},
  prefetch: () => {},
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
}

function renderFieldGps(enabled: boolean) {
  return React.createElement(
    AppRouterContext.Provider,
    { value: fakeRouter },
    React.createElement(FieldGpsLite, {
      enabled,
      recordName: "QA Test Lot",
      offlineMapNote: "",
    }),
  );
}

async function main() {
  const consoleErrors: string[] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(" "));
  };

  const container = document.createElement("div");
  document.body.appendChild(container);
  let root: Root | undefined;

  const { act } = React as unknown as {
    act: (callback: () => void) => void;
  };

  try {
    act(() => {
      root = createRoot(container);
      root.render(renderFieldGps(false));
    });

    console.log(
      "Test 1 (mount with enabled=false renders nothing): " +
        (container.innerHTML === "" ? "PASS" : "FAIL -- container not empty"),
    );
    assert(
      container.innerHTML === "",
      "FieldGpsLite must render nothing (null) when enabled=false.",
    );

    console.log(
      "Test 2 (no geolocation/camera call on disabled mount): " +
        (geolocationCalls === 0 && getUserMediaCalls === 0
          ? "PASS"
          : `FAIL -- geolocationCalls=${geolocationCalls} getUserMediaCalls=${getUserMediaCalls}`),
    );
    assert(
      geolocationCalls === 0 && getUserMediaCalls === 0,
      "No GPS/camera access is allowed while disabled.",
    );

    const TOGGLE_CYCLES = 8;
    for (let cycle = 1; cycle <= TOGGLE_CYCLES; cycle += 1) {
      act(() => {
        root!.render(renderFieldGps(true));
      });
      act(() => {
        root!.render(renderFieldGps(false));
      });
    }

    const hooksOrderErrors = consoleErrors.filter((message) =>
      /order of Hooks|Rendered more hooks|Rendered fewer hooks/i.test(
        message,
      ),
    );

    console.log(
      `Test 3 (${TOGGLE_CYCLES} repeated enabled/disabled toggles raise no Rules-of-Hooks error): ` +
        (hooksOrderErrors.length === 0
          ? "PASS"
          : `FAIL -- ${hooksOrderErrors.length} hooks-order error(s) logged`),
    );
    if (hooksOrderErrors.length > 0) {
      for (const message of hooksOrderErrors) {
        console.log("  " + message);
      }
    }
    assert(
      hooksOrderErrors.length === 0,
      "Toggling `enabled` must never produce a React Hooks-order error (Issue #7).",
    );

    console.log(
      "Test 4 (no geolocation/camera call across repeated toggles, no button clicked): " +
        (geolocationCalls === 0 && getUserMediaCalls === 0
          ? "PASS"
          : `FAIL -- geolocationCalls=${geolocationCalls} getUserMediaCalls=${getUserMediaCalls}`),
    );
    assert(
      geolocationCalls === 0 && getUserMediaCalls === 0,
      "Mounting/toggling alone must never auto-invoke GPS/camera; only explicit user action (Start GPS / Start AR Guide) may.",
    );

    act(() => {
      root!.render(renderFieldGps(true));
    });
    console.log(
      "Test 5 (mount with enabled=true renders the panel trigger): " +
        (container.innerHTML.length > 0 ? "PASS" : "FAIL -- container empty"),
    );
    assert(
      container.innerHTML.length > 0,
      "FieldGpsLite must render its control when enabled=true.",
    );

    act(() => {
      root!.render(renderFieldGps(false));
    });
    console.log(
      "Test 6 (final disable after being enabled renders nothing, no leaked DOM): " +
        (container.innerHTML === "" ? "PASS" : "FAIL -- container not empty"),
    );
    assert(
      container.innerHTML === "",
      "FieldGpsLite must return to rendering nothing once disabled again.",
    );

    const otherErrors = consoleErrors.filter(
      (message) => !hooksOrderErrors.includes(message),
    );
    console.log(
      "Test 7 (no other unexpected console.error during the whole sequence): " +
        (otherErrors.length === 0
          ? "PASS"
          : `FAIL -- ${otherErrors.length} unexpected error(s) logged`),
    );
    if (otherErrors.length > 0) {
      for (const message of otherErrors) {
        console.log("  " + message);
      }
    }
    assert(
      otherErrors.length === 0,
      "No other console.error should be raised by mounting/toggling FieldGpsLite in this scenario.",
    );

    console.log(
      "field-gps-hooks-order QA (Issue #7 regression, FieldGpsLite): ALL PASS",
    );
  } finally {
    console.error = originalConsoleError;
    if (root) {
      act(() => {
        root!.unmount();
      });
    }
    document.body.removeChild(container);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
