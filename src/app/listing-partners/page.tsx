"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";
import {
  createListingPartner,
  getListingPartnerById,
  mapListingPartnerRow,
  updateListingPartnerProfile,
  type ListingPartner,
  type ListingPartnerStatus,
  type WriteErrorCode,
} from "@/lib/listing-partners";

import styles from "./listing-partners.module.css";

// Sprint listing-partner-profile-ui: plain-language copy for each
// ListingPartnerStatus, never a raw status string shown to the user.
// No "manage my listings" link/action appears for `approved` in this
// sprint -- that UI doesn't exist yet (a future sprint), and
// property_listings writes require `approved` anyway per the schema/RLS,
// so nothing to link to would work yet regardless.
const STATUS_COPY: Record<ListingPartnerStatus, { label: string; body: string }> = {
  pending: {
    label: "Menunggu kelulusan",
    body: "Pendaftaran anda sedang disemak. Anda akan boleh cipta senarai hartanah sebaik sahaja diluluskan.",
  },
  approved: {
    label: "Diluluskan",
    body: "Pendaftaran anda telah diluluskan sebagai rakan kongsi senarai hartanah SabahLot.",
  },
  suspended: {
    label: "Digantung",
    body: "Akaun rakan kongsi anda telah digantung. Hubungi pentadbir SabahLot untuk maklumat lanjut.",
  },
  rejected: {
    label: "Tidak diluluskan",
    body: "Pendaftaran anda tidak diluluskan. Hubungi pentadbir SabahLot untuk maklumat lanjut.",
  },
};

// Sprint listing-partner-profile-ui: never renders a coordinator's raw
// `.message` (or any raw Supabase/Postgres error text) directly -- every
// WriteErrorCode this page can actually receive gets its own
// plain-language Malay message here instead.
function messageForErrorCode(
  code: WriteErrorCode,
): string {
  switch (code) {
    case "unauthenticated":
      return "Sesi log masuk anda telah tamat. Sila log masuk semula.";
    case "validation_failed":
      return "Sila lengkapkan nama, telefon dan emel dengan betul.";
    case "duplicate_conflict":
      return "Pendaftaran untuk akaun ini telah wujud dengan maklumat berbeza. Sila muat semula halaman ini.";
    case "not_found_or_forbidden":
      return "Tidak dapat mengesan profil anda. Sila muat semula halaman ini.";
    default:
      return "Tidak dapat menyimpan perubahan buat masa ini. Sila cuba lagi sebentar lagi.";
  }
}

export default function ListingPartnersPage() {
  const [
    sessionChecked,
    setSessionChecked,
  ] = useState(false);

  const [
    currentUserId,
    setCurrentUserId,
  ] = useState<string | null>(null);

  const [
    partnerChecked,
    setPartnerChecked,
  ] = useState(false);

  const [
    partner,
    setPartner,
  ] = useState<ListingPartner | null>(null);

  const [
    displayName,
    setDisplayName,
  ] = useState("");

  const [
    phone,
    setPhone,
  ] = useState("");

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    companyName,
    setCompanyName,
  ] = useState("");

  const [
    renNumber,
    setRenNumber,
  ] = useState("");

  const [
    bio,
    setBio,
  ] = useState("");

  const [
    publicContactConsent,
    setPublicContactConsent,
  ] = useState(false);

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  // Session check -- same pattern as src/app/auth/page.tsx: resolve the
  // current session on mount, then keep listening for sign-in/sign-out.
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
            setPartnerChecked(true);
          }

          setEmail((current) =>
            current || data.user?.email || "",
          );

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
            setPartner(null);
            setPartnerChecked(true);
            setDisplayName("");
            setPhone("");
            setEmail("");
            setCompanyName("");
            setRenNumber("");
            setBio("");
            setPublicContactConsent(false);
          }
        },
      );

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, []);

  // Once a session is known, look up the caller's own listing_partners
  // row (if any). Not re-run on every render -- only when the resolved
  // user id actually changes (sign-in, sign-out, account switch).
  useEffect(() => {
    if (
      !currentUserId
    ) {
      return;
    }

    let active =
      true;

    const loadPartner =
      async () => {
        const supabase =
          createClient();

        const result =
          await getListingPartnerById(
            supabase,
            currentUserId,
          );

        if (
          !active
        ) {
          return;
        }

        if (
          result.ok &&
          result.data
        ) {
          const domainPartner =
            mapListingPartnerRow(result.data);

          setPartner(domainPartner);
          setDisplayName(domainPartner.displayName);
          setPhone(domainPartner.phone);
          setEmail(domainPartner.email);
          setCompanyName(domainPartner.companyName ?? "");
          setRenNumber(domainPartner.renNumber ?? "");
          setBio(domainPartner.bio ?? "");
          setPublicContactConsent(domainPartner.publicContactConsent);
        } else {
          setPartner(null);
        }

        setPartnerChecked(true);
      };

    void loadPartner();

    return () => {
      active =
        false;
    };
  }, [currentUserId]);

  const clearFeedback =
    () => {
      setMessage("");
      setErrorMessage("");
    };

  const validateFormFields =
    (): string | null => {
      if (
        displayName.trim().length === 0
      ) {
        return "Nama paparan tidak boleh kosong.";
      }

      if (
        phone.trim().length === 0
      ) {
        return "Nombor telefon tidak boleh kosong.";
      }

      if (
        email.trim().length === 0
      ) {
        return "Alamat emel tidak boleh kosong.";
      }

      return null;
    };

  const submitRegistration =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      clearFeedback();

      const validationError =
        validateFormFields();

      if (
        validationError
      ) {
        setErrorMessage(validationError);
        return;
      }

      setBusy(true);

      const supabase =
        createClient();

      const result =
        await createListingPartner(
          supabase,
          {
            displayName: displayName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            companyName: companyName.trim() || null,
            renNumber: renNumber.trim() || null,
            bio: bio.trim() || null,
            publicContactConsent,
          },
        );

      if (
        result.ok
      ) {
        setPartner(result.data);
        setMessage("Pendaftaran berjaya dihantar. Ia kini menunggu kelulusan.");
      } else {
        setErrorMessage(messageForErrorCode(result.code));
      }

      setBusy(false);
    };

  const submitProfileUpdate =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      clearFeedback();

      const validationError =
        validateFormFields();

      if (
        validationError
      ) {
        setErrorMessage(validationError);
        return;
      }

      setBusy(true);

      const supabase =
        createClient();

      const result =
        await updateListingPartnerProfile(
          supabase,
          {
            displayName: displayName.trim(),
            phone: phone.trim(),
            email: email.trim(),
            companyName: companyName.trim() || null,
            renNumber: renNumber.trim() || null,
            bio: bio.trim() || null,
            publicContactConsent,
          },
        );

      if (
        result.ok
      ) {
        setPartner(result.data);
        setMessage("Profil berjaya dikemas kini.");
      } else {
        setErrorMessage(messageForErrorCode(result.code));
      }

      setBusy(false);
    };

  const renderFields =
    () => (
      <>
        <label>
          <span>
            Nama paparan
          </span>

          <input
            type="text"
            value={displayName}
            onChange={(event) =>
              setDisplayName(event.target.value)
            }
            required
          />
        </label>

        <label>
          <span>
            Nama syarikat (jika ada)
          </span>

          <input
            type="text"
            value={companyName}
            onChange={(event) =>
              setCompanyName(event.target.value)
            }
          />
        </label>

        <label>
          <span>
            Nombor telefon
          </span>

          <input
            type="tel"
            value={phone}
            onChange={(event) =>
              setPhone(event.target.value)
            }
            required
          />
        </label>

        <label>
          <span>
            Alamat emel
          </span>

          <input
            type="email"
            value={email}
            onChange={(event) =>
              setEmail(event.target.value)
            }
            required
          />
        </label>

        <label>
          <span>
            Nombor lesen REN (jika ada)
          </span>

          <input
            type="text"
            value={renNumber}
            onChange={(event) =>
              setRenNumber(event.target.value)
            }
          />
        </label>

        <label>
          <span>
            Perihal ringkas (pilihan)
          </span>

          <textarea
            value={bio}
            onChange={(event) =>
              setBio(event.target.value)
            }
            rows={3}
          />
        </label>

        <label className={styles.consentRow}>
          <input
            type="checkbox"
            checked={publicContactConsent}
            onChange={(event) =>
              setPublicContactConsent(event.target.checked)
            }
          />

          <span>
            Saya bersetuju nombor telefon dan emel saya dipaparkan secara
            terbuka kepada pelawat pada senarai hartanah saya yang aktif.
            Tanpa persetujuan ini, maklumat hubungan saya tidak akan
            dipaparkan secara terbuka.
          </span>
        </label>
      </>
    );

  return (
    <main className={styles.page}>
      <div className={styles.glow} />

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
                Listing Partner
              </small>
            </span>
          </div>

          <Link
            href="/"
            className={styles.mapLink}
          >
            Kembali ke peta
          </Link>
        </header>

        <div className={styles.intro}>
          <span className={styles.eyebrow}>
            SabahLot powered by Myukur
          </span>

          <h1>
            Rakan Kongsi Senarai Hartanah
          </h1>

          <p>
            Daftar sebagai rakan kongsi untuk menyenaraikan hartanah/tanah
            anda pada direktori awam SabahLot.
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
              Sila log masuk terlebih dahulu untuk mendaftar sebagai rakan
              kongsi senarai hartanah.
            </p>

            <Link
              href="/auth"
              className={styles.signInLink}
            >
              Log masuk / Daftar akaun
            </Link>
          </section>
        )}

        {sessionChecked && currentUserId && !partnerChecked && (
          <p className={styles.loading}>
            Menyemak status pendaftaran anda...
          </p>
        )}

        {sessionChecked && currentUserId && partnerChecked && !partner && (
          <form
            className={styles.form}
            onSubmit={submitRegistration}
          >
            {renderFields()}

            <button
              type="submit"
              disabled={busy}
            >
              {busy
                ? "Menghantar..."
                : "Daftar sebagai rakan kongsi"}
            </button>
          </form>
        )}

        {sessionChecked && currentUserId && partnerChecked && partner && (
          <>
            <section
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
              <span>
                {STATUS_COPY[partner.status].label}
              </span>

              <p>
                {STATUS_COPY[partner.status].body}
              </p>
            </section>

            <form
              className={styles.form}
              onSubmit={submitProfileUpdate}
            >
              {renderFields()}

              <button
                type="submit"
                disabled={busy}
              >
                {busy
                  ? "Menyimpan..."
                  : "Kemas kini profil"}
              </button>
            </form>
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
