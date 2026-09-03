"use client";

import {
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  reconcileAccountSession,
  type AccountSessionUserId,
} from "@/lib/account-session-boundary";
import {
  createClient,
} from "@/lib/supabase/client";

interface AccountSessionBoundaryProps {
  children: ReactNode;
}

export default function AccountSessionBoundary({
  children,
}: AccountSessionBoundaryProps) {
  const [ready, setReady] = useState(false);
  const previousUserId = useRef<AccountSessionUserId | undefined>(
    undefined,
  );
  const reloadStarted = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const applyUser = (nextUserId: AccountSessionUserId) => {
      if (!active || reloadStarted.current) {
        return;
      }

      const result = reconcileAccountSession(
        previousUserId.current,
        nextUserId,
      );

      previousUserId.current = result.nextUserId;

      if (result.requiresHardReload) {
        reloadStarted.current = true;
        setReady(false);
        window.location.reload();
        return;
      }

      setReady(true);
    };

    const readCurrentUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (!active) {
        return;
      }

      applyUser(data.user?.id ?? null);
    };

    const {
      data: {
        subscription,
      },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user.id ?? null);
    });

    const handlePageShow = () => {
      void readCurrentUser();
    };

    window.addEventListener("pageshow", handlePageShow);
    void readCurrentUser();

    return () => {
      active = false;
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  if (!ready) {
    return (
      <main
        aria-busy="true"
        aria-label="Verifying SabahLot account session"
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#0f172a",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <p style={{ margin: 0 }}>
          Verifying account session…
        </p>
      </main>
    );
  }

  return children;
}
