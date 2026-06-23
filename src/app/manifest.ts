import type {
  MetadataRoute,
} from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:
      "SabahLot powered by Myukur",
    short_name:
      "SabahLot",
    description:
      "Preliminary Sabah land workflow tool for planning and reference only.",
    display:
      "standalone",
    start_url:
      "/",
    scope:
      "/",
    theme_color:
      "#0F172A",
    background_color:
      "#F8FAFC",
    orientation:
      "any",
    icons: [
      {
        src:
          "/sabahlot-icon-192.svg",
        sizes:
          "192x192",
        type:
          "image/svg+xml",
        purpose:
          "any",
      },
      {
        src:
          "/sabahlot-icon-512.svg",
        sizes:
          "512x512",
        type:
          "image/svg+xml",
        purpose:
          "any",
      },
    ],
  };
}
