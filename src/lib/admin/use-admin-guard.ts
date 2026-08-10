"use client";

// Sprint admin-dashboard, Design decision 2: shared session +
// `profiles.role` admin check, extracted from the original inline
// implementation in src/app/listing-partners/admin/page.tsx (Sprint
// listing-partner-admin-approval-ui's own Design decision 2 explicitly
// predicted this exact moment -- "in case a second admin screen later
// wants to reuse this check"). Behavior-preserving extraction: every
// state transition here matches the original inline effects exactly.
//
// UX-only. The real access boundary is RLS on each admin-broad-read
// policy this hook's callers depend on (listing_partners_select_admin,
// profiles_select_admin, etc.) -- this hook only decides what a page
// renders, never what a query is allowed to return.

import {
  useEffect,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

export interface AdminGuardState {
  sessionChecked: boolean;
  currentUserId: string | null;
  roleChecked: boolean;
  isAdmin: boolean;
}

export function useAdminGuard(): AdminGuardState {
  const [
    sessionChecked,
    setSessionChecked,
  ] = useState(false);

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | null>(null);

  const [
    roleChecked,
    setRoleChecked,
  ] = useState(false);

  const [
    isAdmin,
    setIsAdmin,
  ] = useState(false);

  useEffect(() => {
    const supabase =
      createClient();

    let active =
      true;

    const loadUser =
      async () => {
        const {
          data,
        } =
          await supabase.auth.getUser();

        if (active) {
          setCurrentUserId(
            data.user?.id ?? null,
          );

          if (
            !data.user?.id
          ) {
            setRoleChecked(true);
          }

          setSessionChecked(true);
        }
      };

    void loadUser();

    const {
      data: {
        subscription,
      },
    } =
      supabase.auth.onAuthStateChange(
        (
          _event,
          session,
        ) => {
          setCurrentUserId(
            session?.user.id ?? null,
          );

          if (
            !session?.user.id
          ) {
            setIsAdmin(false);
            setRoleChecked(true);
          }
        },
      );

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      !currentUserId
    ) {
      return;
    }

    let active =
      true;

    const loadRole =
      async () => {
        const supabase =
          createClient();

        const {
          data,
        } =
          await supabase
            .from("profiles")
            .select("role")
            .eq("id", currentUserId)
            .maybeSingle();

        if (
          !active
        ) {
          return;
        }

        setIsAdmin(
          data?.role === "admin",
        );
        setRoleChecked(true);
      };

    void loadRole();

    return () => {
      active =
        false;
    };
  }, [currentUserId]);

  return {
    sessionChecked,
    currentUserId,
    roleChecked,
    isAdmin,
  };
}
