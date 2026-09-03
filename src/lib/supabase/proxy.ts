import { createServerClient } from "@supabase/ssr";
import {
  NextResponse,
  type NextRequest,
} from "next/server";

const SUPABASE_AUTH_COOKIE_MARKER = "-auth-token";

function clearStaleSupabaseAuthCookies(
  request: NextRequest,
  response: NextResponse,
) {
  request.cookies
    .getAll()
    .filter(({ name }) =>
      name.startsWith("sb-") &&
      name.includes(SUPABASE_AUTH_COOKIE_MARKER),
    )
    .forEach(({ name }) => {
      request.cookies.delete(name);
      response.cookies.delete(name);
    });
}

export async function updateSession(
  request: NextRequest,
) {
  let response =
    NextResponse.next({
      request,
    });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (
    !supabaseUrl ||
    !supabasePublishableKey
  ) {
    return response;
  }

  const supabase =
    createServerClient(
      supabaseUrl,
      supabasePublishableKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },

          setAll(cookiesToSet) {
            cookiesToSet.forEach(
              ({
                name,
                value,
              }) => {
                request.cookies.set(
                  name,
                  value,
                );
              },
            );

            response =
              NextResponse.next({
                request,
              });

            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                response.cookies.set(
                  name,
                  value,
                  options,
                );
              },
            );
          },
        },
      },
    );

  try {
    await supabase.auth.getClaims();
  } catch {
    // A revoked/expired refresh token is a recoverable client-session state,
    // not a server failure. Remove only Supabase auth-token cookies so the
    // next request starts signed out instead of repeatedly throwing in proxy.
    clearStaleSupabaseAuthCookies(
      request,
      response,
    );
  }

  return response;
}
