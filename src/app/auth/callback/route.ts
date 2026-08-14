import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

function redirectToAuthError(
  requestUrl: URL,
  authStatus: string,
) {
  const errorUrl =
    new URL(
      "/auth",
      requestUrl.origin,
    );

  errorUrl.searchParams.set(
    "auth",
    authStatus,
  );

  return NextResponse.redirect(
    errorUrl,
  );
}

export async function GET(
  request: NextRequest,
) {
  const requestUrl =
    new URL(request.url);

  const code =
    requestUrl.searchParams.get(
      "code",
    );

  if (!code) {
    return redirectToAuthError(
      requestUrl,
      "oauth-missing-code",
    );
  }

  try {
    const supabase =
      await createClient();

    const {
      error,
    } =
      await supabase.auth.exchangeCodeForSession(
        code,
      );

    if (error) {
      return redirectToAuthError(
        requestUrl,
        "callback-error",
      );
    }

    const successUrl =
      new URL(
        "/",
        requestUrl.origin,
      );

    return NextResponse.redirect(
      successUrl,
    );
  } catch {
    return redirectToAuthError(
      requestUrl,
      "callback-error",
    );
  }
}
