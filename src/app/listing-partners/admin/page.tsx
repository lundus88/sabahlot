"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";
import {
  listAllListingPartnersRow,
  mapListingPartnerRow,
  updateListingPartnerStatus,
  type ListingPartner,
  type ListingPartnerStatus,
} from "@/lib/listing-partners";

import styles from "./listing-partners-admin.module.css";

const STATUS_LABEL: Record<ListingPartnerStatus, string> = {
  pending: "Menunggu kelulusan",
  approved: "Diluluskan",
  suspended: "Digantung",
  rejected: "Tidak diluluskan",
};

// Sprint listing-partner-admin-approval-ui, Design decision 4: the action
// set offered for a row depends entirely on its current status. Every
// action calls the same, already-built updateListingPartnerStatus
// coordinator -- this sprint adds no new write path.
const STATUS_ACTIONS: Record<
  ListingPartnerStatus,
  ReadonlyArray<{ label: string; target: ListingPartnerStatus; kind: "primary" | "danger" }>
> = {
  pending: [
    { label: "Luluskan", target: "approved", kind: "primary" },
    { label: "Tolak", target: "rejected", kind: "danger" },
  ],
  approved: [
    { label: "Gantung", target: "suspended", kind: "danger" },
  ],
  suspended: [
    { label: "Luluskan semula", target: "approved", kind: "primary" },
  ],
  rejected: [
    { label: "Luluskan", target: "approved", kind: "primary" },
  ],
};

// Never renders a raw coordinator/Supabase error string -- same
// non-disclosing posture as every other Listing Partner UI page.
function messageForStatusChangeFailure(): string {
  return "Tidak dapat mengemas kini status rakan kongsi ini. Ia mungkin telah berubah di tempat lain -- sila muat semula halaman ini.";
}

export default function ListingPartnersAdminPage() {
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

  const [
    partnersLoading,
    setPartnersLoading,
  ] = useState(true);

  const [
    partners,
    setPartners,
  ] = useState<ListingPartner[]>([]);

  const [
    busyPartnerId,
    setBusyPartnerId,
  ] = useState<string | null>(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  // Session check -- same pattern as the other 3 Listing Partner pages.
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
            setPartnersLoading(false);
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
            setPartners([]);
            setPartnersLoading(false);
          }
        },
      );

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, []);

  // Design decision 2: a page-local, narrow read of the caller's own
  // `profiles.role` -- purely a UX gate so a non-admin sees a clear
  // message instead of a confusingly-empty table. RLS
  // (listing_partners_select_admin) is the real enforcement boundary
  // regardless of what this check concludes.
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

  // Once confirmed admin, load every listing_partners row.
  useEffect(() => {
    if (
      !isAdmin
    ) {
      return;
    }

    let active =
      true;

    const loadPartners =
      async () => {
        setPartnersLoading(true);

        const supabase =
          createClient();

        const result =
          await listAllListingPartnersRow(supabase);

        if (
          !active
        ) {
          return;
        }

        if (
          result.ok
        ) {
          setPartners(
            result.data.map(mapListingPartnerRow),
          );
        }

        setPartnersLoading(false);
      };

    void loadPartners();

    return () => {
      active =
        false;
    };
  }, [isAdmin]);

  // Design decision 3: pending rows sorted first (need action), then the
  // rest in the order the query already returned (created_at descending).
  // No new query complexity -- this grouping is purely a render-time
  // derivation over the already-loaded list.
  const sortedPartners =
    [
      ...partners.filter((partner) => partner.status === "pending"),
      ...partners.filter((partner) => partner.status !== "pending"),
    ];

  const handleStatusChange =
    async (
      partner: ListingPartner,
      target: ListingPartnerStatus,
    ) => {
      setMessage("");
      setErrorMessage("");
      setBusyPartnerId(partner.id);

      const supabase =
        createClient();

      const result =
        await updateListingPartnerStatus(
          supabase,
          partner.id,
          target,
        );

      if (
        result.ok
      ) {
        setPartners((current) =>
          current.map((item) =>
            item.id === result.data.id ? result.data : item,
          ),
        );
        setMessage(
          `Status "${result.data.displayName}" dikemas kini kepada ${STATUS_LABEL[result.data.status]}.`,
        );
      } else {
        setErrorMessage(messageForStatusChangeFailure());
      }

      setBusyPartnerId(null);
    };

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.mark}>
              SL
            </span>

            <span>
              <strong>
                SabahLot
              </strong>

              <small>
                Listing Partner · Admin
              </small>
            </span>
          </div>

          <Link
            href="/listing-partners"
            className={styles.mapLink}
          >
            Profil rakan kongsi
          </Link>
        </header>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            SabahLot powered by Myukur
          </span>

          <h1>
            Kelulusan Rakan Kongsi
          </h1>

          <p>
            Semak dan uruskan pendaftaran rakan kongsi senarai hartanah.
          </p>
        </div>

        {!sessionChecked && (
          <p className={styles.loading}>
            Menyemak sesi anda...
          </p>
        )}

        {sessionChecked && !currentUserId && (
          <section className={styles.session}>
            <span>
              Log masuk diperlukan
            </span>

            <p>
              Sila log masuk dengan akaun pentadbir untuk mengakses skrin
              ini.
            </p>

            <Link
              href="/auth"
              className={styles.signInLink}
            >
              Log masuk / Daftar akaun
            </Link>
          </section>
        )}

        {sessionChecked && currentUserId && !roleChecked && (
          <p className={styles.loading}>
            Menyemak kebenaran akses...
          </p>
        )}

        {sessionChecked && currentUserId && roleChecked && !isAdmin && (
          <section className={styles.session}>
            <span>
              Akses pentadbir diperlukan
            </span>

            <p>
              Akaun anda tidak mempunyai akses pentadbir untuk skrin ini.
            </p>
          </section>
        )}

        {sessionChecked && currentUserId && roleChecked && isAdmin && (
          <>
            {partnersLoading && (
              <p className={styles.loading}>
                Memuatkan senarai rakan kongsi...
              </p>
            )}

            {!partnersLoading && sortedPartners.length === 0 && (
              <p className={styles.empty}>
                Tiada pendaftaran rakan kongsi lagi.
              </p>
            )}

            {!partnersLoading && sortedPartners.length > 0 && (
              <ul className={styles.partnerList}>
                {sortedPartners.map((partner) => (
                  <li
                    key={partner.id}
                    className={styles.partnerCard}
                  >
                    <div className={styles.partnerCardHeader}>
                      <strong>
                        {partner.companyName || partner.displayName}
                      </strong>

                      <span
                        className={
                          partner.status === "approved"
                            ? styles.statusApproved
                            : partner.status === "pending"
                              ? styles.statusPending
                              : partner.status === "suspended"
                                ? styles.statusSuspended
                                : styles.statusRejected
                        }
                      >
                        {STATUS_LABEL[partner.status]}
                      </span>
                    </div>

                    {partner.companyName && (
                      <p className={styles.partnerSubName}>
                        {partner.displayName}
                      </p>
                    )}

                    <p className={styles.partnerMeta}>
                      {partner.phone} · {partner.email}
                      {partner.renNumber && ` · REN ${partner.renNumber}`}
                    </p>

                    <p className={styles.partnerMeta}>
                      Didaftarkan: {new Date(partner.createdAt).toLocaleDateString("ms-MY")}
                    </p>

                    <div className={styles.partnerActions}>
                      {STATUS_ACTIONS[partner.status].map((action) => (
                        <button
                          key={action.target}
                          type="button"
                          className={
                            action.kind === "danger"
                              ? styles.dangerButton
                              : undefined
                          }
                          onClick={() => handleStatusChange(partner, action.target)}
                          disabled={busyPartnerId !== null}
                        >
                          {busyPartnerId === partner.id
                            ? "Menyimpan..."
                            : action.label}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {message && (
          <p
            className={styles.success}
            role="status"
          >
            {message}
          </p>
        )}

        {errorMessage && (
          <p
            className={styles.error}
            role="alert"
          >
            {errorMessage}
          </p>
        )}

        <footer className={styles.footer}>
          SabahLot powered by Myukur · Preliminary Alpha
        </footer>
      </section>
    </main>
  );
}
