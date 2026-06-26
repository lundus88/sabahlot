import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  buildGpx,
} from "@/lib/gps/gps-export";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const gpx = buildGpx({
      name: body.name ?? "SabahLot GPX Export",
      waypoints: body.waypoints ?? [],
      tracks: body.tracks ?? [],
    });

    return new NextResponse(gpx, {
      headers: {
        "Content-Type": "application/gpx+xml",
        "Content-Disposition":
          'attachment; filename="sabahlot-export.gpx"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "GPX export failed.",
      },
      {
        status: 500,
      },
    );
  }
}
