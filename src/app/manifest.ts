import type { MetadataRoute } from "next";

type SabahLotManifest = MetadataRoute.Manifest & {
  display_override?: Array<"fullscreen" | "standalone" | "minimal-ui" | "browser">;
};

export default function manifest(): SabahLotManifest {
  const isGpsDeployment = process.env.NEXT_PUBLIC_DEPLOYMENT_TARGET === "gps";

  return {
    name: isGpsDeployment ? "SabahLot GPS" : "SabahLot",
    short_name: isGpsDeployment ? "GPS" : "SabahLot",
    description: isGpsDeployment
      ? "SabahLot Preliminary Field Assist"
      : "Preliminary land workflow platform for Sabah",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["fullscreen", "standalone", "minimal-ui"],
    orientation: "portrait",
    theme_color: "#0f172a",
    background_color: "#0f172a",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
