 import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabasePublishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL tidak ditemui dalam .env.local",
    );
  }

  if (!supabasePublishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tidak ditemui dalam .env.local",
    );
  }

  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(
              ({
                name,
                value,
                options,
              }) => {
                cookieStore.set(
                  name,
                  value,
                  options,
                );
              },
            );
          } catch {
            /*
             * Server Components tidak sentiasa dibenarkan
             * menulis cookie. Sesi nanti akan disegarkan
             * melalui proxy Supabase.
             */
          }
        },
      },
    },
  );
}