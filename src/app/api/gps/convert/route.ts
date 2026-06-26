import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  convertWgs84ToProjection,
} from "@/lib/gps/gps-coordinate";

import type {
  SabahProjection,
} from "@/lib/gps/gps-types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const target = body.target as SabahProjection;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        {
          error: "Invalid lat/lng.",
        },
        {
          status: 400,
        },
      );
    }

    const result = convertWgs84ToProjection(
      lat,
      lng,
      target,
    );

    return NextResponse.json({
      result,
      disclaimer:
        "Preliminary coordinate conversion only. Not for legal boundary confirmation.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Coordinate conversion failed.",
      },
      {
        status: 500,
      },
    );
  }
}
