 import type {
  Metadata,
  Viewport,
} from "next";

import type {
  ReactNode,
} from "react";

import { Inter } from "next/font/google";

import PWARegister from "@/components/PWARegister";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title:
    "SabahLot powered by Myukur",

  description:
    "Preliminary Sabah land workflow tool for planning and reference only.",

  applicationName:
    "SabahLot powered by Myukur",

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
      "SabahLot powered by Myukur",
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
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <PWARegister />
      </body>
    </html>
  );
}

