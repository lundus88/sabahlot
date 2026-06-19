 import type {
  Metadata,
  Viewport,
} from "next";

import type {
  ReactNode,
} from "react";

import "./globals.css";

export const metadata: Metadata = {
  title:
    "SabahLot",

  description:
    "Preliminary land planning and mapping tool for Sabah.",

  applicationName:
    "SabahLot",

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
      "SabahLot",
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
    "#0F172A",
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
      </body>
    </html>
  );
}
