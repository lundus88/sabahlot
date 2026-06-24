import type {
  MetadataRoute,
} from "next";

type SabahLotDisplayMode =
  NonNullable<MetadataRoute.Manifest["display"]>;

type SabahLotManifest =
  MetadataRoute.Manifest & {
    display_override: SabahLotDisplayMode[];
  };

export default function manifest(): MetadataRoute.Manifest {
  const sabahLotManifest: SabahLotManifest = {
    name:
      "SabahLot",
    short_name:
      "SabahLot",
    description:
      "Preliminary Sabah land workflow tool for planning and reference only.",
    display:
      "standalone",
    display_override: [
      "fullscreen",
      "standalone",
      "minimal-ui",
    ],
    start_url:
      "/",
    scope:
      "/",
    theme_color:
      "#0f172a",
    background_color:
      "#0f172a",
    orientation:
      "portrait",
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

  return sabahLotManifest;
}
