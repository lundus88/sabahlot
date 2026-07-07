 import type {
  Metadata,
  Viewport,
} from "next";

import type {
  ReactNode,
} from "react";

import PWARegister from "@/components/PWARegister";

import "./globals.css";

const isGpsDeployment =
  process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === "gps";

const appTitle = isGpsDeployment
  ? "SabahLot GPS — Preliminary Field Assist"
  : "SabahLot powered by Myukur";

export const metadata: Metadata = {
  title:
    appTitle,

  description:
    isGpsDeployment
      ? "SabahLot Preliminary Field Assist — handheld GPS, Find Point, Stakeout, and AR Guide for preliminary field reference only. Not a cadastral survey or JTU Sabah system."
      : "Preliminary Sabah land workflow tool for planning and reference only.",

  applicationName:
    isGpsDeployment
      ? "SabahLot GPS"
      : "SabahLot powered by Myukur",

  manifest:
    "/manifest.webmanifest",

  icons: {
    icon: [
      {
        url:
          "/sabahlot-icon-192.svg",
        sizes:
          "192x192",
        type:
          "image/svg+xml",
      },
      {
        url:
          "/sabahlot-icon-512.svg",
        sizes:
          "512x512",
        type:
          "image/svg+xml",
      },
    ],
    apple:
      "/sabahlot-icon-192.svg",
  },

  appleWebApp: {
    capable:
      true,
    title:
      isGpsDeployment
        ? "SabahLot GPS"
        : "SabahLot powered by Myukur",
    statusBarStyle:
      "black-translucent",
  },
};

export const viewport: Viewport = {
  width:
    "device-width",

  initialScale:
    1,

  maximumScale:
    5,

  viewportFit:
    "cover",

  themeColor:
    "#0f172a",
};

interface RootLayoutProps {
  children:
    ReactNode;
}

export default function RootLayout({
  children,
}: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}

