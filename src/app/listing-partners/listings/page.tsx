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
  createPropertyListing,
  deletePropertyListing,
  getListingPartnerById,
  listOwnPropertyListingsRow,
  mapListingPartnerRow,
  mapPropertyListingRow,
  updatePropertyListing,
  type PropertyListing,
  type PropertyListingRegion,
  type PropertyListingStatus,
  type PropertyListingType,
  type WriteErrorCode,
} from "@/lib/listing-partners";

import styles from "./listing-partners-listings.module.css";

// Sprint listing-partner-my-listings-ui, Design decision 4: only 6 of
// property_listing_status's 8 values are ever offered here.
// `pending_review` is unused by any existing code path; `expired` is
// never actually written to `status` by any code (ADR-027 item 5 --
// expiry is a virtual, RLS-only effect of `updated_at` staleness), so
// offering it as a selectable value would misrepresent how it works.
const STATUS_OPTIONS: ReadonlyArray<[PropertyListingStatus, string]> = [
  ["draft", "Draf (belum diterbitkan)"],
  ["active", "Aktif (boleh dilihat awam)"],
  ["under_offer", "Dalam tawaran"],
  ["sold", "Telah dijual"],
  ["leased", "Telah disewa"],
  ["removed", "Ditarik balik"],
];

const LISTING_TYPE_OPTIONS: ReadonlyArray<[PropertyListingType, string]> = [
  ["for_sale", "Untuk dijual"],
  ["for_lease", "Untuk disewa"],
];

const REGION_OPTIONS: ReadonlyArray<[PropertyListingRegion, string]> = [
  ["sabah", "Sabah"],
  ["sarawak", "Sarawak"],
  ["peninsular", "Semenanjung"],
];

const STATUS_LABEL: Record<PropertyListingStatus, string> = {
  draft: "Draf",
  pending_review: "Menunggu semakan",
  active: "Aktif",
  under_offer: "Dalam tawaran",
  sold: "Telah dijual",
  leased: "Telah disewa",
  expired: "Tamat tempoh",
  removed: "Ditarik balik",
};

function messageForErrorCode(
  code: WriteErrorCode,
): string {
  switch (code) {
    case "unauthenticated":
      return "Sesi log masuk anda telah tamat. Sila log masuk semula.";
    case "validation_failed":
      return "Sila lengkapkan tajuk dan jenis listing dengan betul.";
    case "duplicate_conflict":
      return "Listing ini telah wujud dengan maklumat berbeza. Sila muat semula halaman ini.";
    case "not_found_or_forbidden":
      return "Listing ini tidak ditemui, atau status pendaftaran anda tidak lagi membenarkan tindakan ini. Sila muat semula halaman ini.";
    case "partner_not_approved":
      return "Pendaftaran rakan kongsi anda tidak/tidak lagi diluluskan.";
    default:
      return "Tidak dapat menyimpan perubahan buat masa ini. Sila cuba lagi sebentar lagi.";
  }
}

interface ListingFormState {
  title: string;
  description: string;
  listingType: PropertyListingType;
  price: string;
  district: string;
  village: string;
  region: PropertyListingRegion | "";
  status: PropertyListingStatus;
}

const BLANK_FORM: ListingFormState = {
  title: "",
  description: "",
  listingType: "for_sale",
  price: "",
  district: "",
  village: "",
  region: "",
  status: "draft",
};

export default function MyListingsPage() {
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
    isApprovedPartner,
    setIsApprovedPartner,
  ] = useState(false);

  const [
    listingsLoading,
    setListingsLoading,
  ] = useState(true);

  const [
    listings,
    setListings,
  ] = useState<PropertyListing[]>([]);

  const [
    formOpen,
    setFormOpen,
  ] = useState(false);

  const [
    editingId,
    setEditingId,
  ] = useState<string | null>(null);

  const [
    form,
    setForm,
  ] = useState<ListingFormState>(BLANK_FORM);

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

  // Session check -- same pattern as src/app/listing-partners/page.tsx.
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
            setListingsLoading(false);
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
            setIsApprovedPartner(false);
            setPartnerChecked(true);
            setListings([]);
            setListingsLoading(false);
          }
        },
      );

    return () => {
      active =
        false;

      subscription.unsubscribe();
    };
  }, []);

  // Once a session is known, confirm the caller is an approved partner --
  // this page's whole access gate (Design decision 2).
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

        const approved =
          result.ok &&
          !!result.data &&
          mapListingPartnerRow(result.data).status === "approved";

        setIsApprovedPartner(approved);
        setPartnerChecked(true);

        if (
          !approved
        ) {
          setListingsLoading(false);
        }
      };

    void loadPartner();

    return () => {
      active =
        false;
    };
  }, [currentUserId]);

  // Once confirmed approved, load this partner's own listings.
  useEffect(() => {
    if (
      !currentUserId ||
      !isApprovedPartner
    ) {
      return;
    }

    let active =
      true;

    const loadListings =
      async () => {
        setListingsLoading(true);

        const supabase =
          createClient();

        const result =
          await listOwnPropertyListingsRow(
            supabase,
            currentUserId,
          );

        if (
          !active
        ) {
          return;
        }

        if (
          result.ok
        ) {
          setListings(
            result.data.map(mapPropertyListingRow),
          );
        }

        setListingsLoading(false);
      };

    void loadListings();

    return () => {
      active =
        false;
    };
  }, [currentUserId, isApprovedPartner]);

  const clearFeedback =
    () => {
      setMessage("");
      setErrorMessage("");
    };

  const openCreateForm =
    () => {
      clearFeedback();
      setEditingId(null);
      setForm(BLANK_FORM);
      setFormOpen(true);
    };

  const openEditForm =
    (
      listing: PropertyListing,
    ) => {
      clearFeedback();
      setEditingId(listing.id);
      setForm({
        title: listing.title,
        description: listing.description ?? "",
        listingType: listing.listingType,
        price: listing.price === null ? "" : String(listing.price),
        district: listing.district ?? "",
        village: listing.village ?? "",
        region: listing.region ?? "",
        status: listing.status === "pending_review" || listing.status === "expired"
          ? "draft"
          : listing.status,
      });
      setFormOpen(true);
    };

  const closeForm =
    () => {
      setFormOpen(false);
      setEditingId(null);
      setForm(BLANK_FORM);
    };

  const validateListingForm =
    (): string | null => {
      if (
        form.title.trim().length === 0
      ) {
        return "Tajuk listing tidak boleh kosong.";
      }

      return null;
    };

  const submitListingForm =
    async (
      event: FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();
      clearFeedback();

      const validationError =
        validateListingForm();

      if (
        validationError
      ) {
        setErrorMessage(validationError);
        return;
      }

      setBusy(true);

      const supabase =
        createClient();

      const patch = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        listingType: form.listingType,
        price: form.price.trim() === "" ? null : Number(form.price),
        district: form.district.trim() || null,
        village: form.village.trim() || null,
        region: form.region || null,
        status: form.status,
      };

      const result =
        editingId
          ? await updatePropertyListing(
              supabase,
              editingId,
              patch,
            )
          : await createPropertyListing(
              supabase,
              {
                id: crypto.randomUUID(),
                ...patch,
              },
            );

      if (
        result.ok
      ) {
        setListings((current) => {
          const withoutThisOne =
            current.filter((item) => item.id !== result.data.id);

          return [result.data, ...withoutThisOne].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() -
              new Date(a.updatedAt).getTime(),
          );
        });

        setMessage(
          editingId
            ? "Listing berjaya dikemas kini."
            : "Listing baharu berjaya dicipta.",
        );

        closeForm();
      } else {
        setErrorMessage(messageForErrorCode(result.code));
      }

      setBusy(false);
    };

  const handleDelete =
    async (
      listing: PropertyListing,
    ) => {
      const confirmed =
        window.confirm(
          `Padam listing "${listing.title}"? Tindakan ini tidak boleh dibatalkan.`,
        );

      if (
        !confirmed
      ) {
        return;
      }

      clearFeedback();
      setBusy(true);

      const supabase =
        createClient();

      const result =
        await deletePropertyListing(
          supabase,
          listing.id,
        );

      if (
        result.ok
      ) {
        setListings((current) =>
          current.filter((item) => item.id !== listing.id),
        );
        setMessage("Listing berjaya dipadam.");
      } else {
        setErrorMessage(messageForErrorCode(result.code));
      }

      setBusy(false);
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
                Listing Partner
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
            Urus Listing Saya
          </h1>

          <p>
            Cipta, kemas kini, atau padam senarai hartanah anda sendiri.
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
              Sila log masuk terlebih dahulu untuk mengurus listing anda.
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

        {sessionChecked && currentUserId && partnerChecked && !isApprovedPartner && (
          <section className={styles.session}>
            <span>
              Kelulusan diperlukan
            </span>

            <p>
              Anda perlu didaftarkan dan diluluskan sebagai rakan kongsi
              senarai hartanah sebelum boleh mengurus listing.
            </p>

            <Link
              href="/listing-partners"
              className={styles.signInLink}
            >
              Semak status pendaftaran
            </Link>
          </section>
        )}

        {sessionChecked && currentUserId && partnerChecked && isApprovedPartner && (
          <>
            {!formOpen && (
              <button
                type="button"
                className={styles.addButton}
                onClick={openCreateForm}
              >
                + Tambah listing baharu
              </button>
            )}

            {formOpen && (
              <form
                className={styles.form}
                onSubmit={submitListingForm}
              >
                <label>
                  <span>
                    Tajuk listing
                  </span>

                  <input
                    type="text"
                    value={form.title}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                  />
                </label>

                <label>
                  <span>
                    Jenis
                  </span>

                  <select
                    value={form.listingType}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        listingType: event.target.value as PropertyListingType,
                      }))
                    }
                  >
                    {LISTING_TYPE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    Perihal (pilihan)
                  </span>

                  <textarea
                    value={form.description}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, description: event.target.value }))
                    }
                    rows={3}
                  />
                </label>

                <label>
                  <span>
                    Harga (RM, pilihan)
                  </span>

                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, price: event.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>
                    Daerah (pilihan)
                  </span>

                  <input
                    type="text"
                    value={form.district}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, district: event.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>
                    Kampung/Mukim (pilihan)
                  </span>

                  <input
                    type="text"
                    value={form.village}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, village: event.target.value }))
                    }
                  />
                </label>

                <label>
                  <span>
                    Wilayah (pilihan)
                  </span>

                  <select
                    value={form.region}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        region: event.target.value as PropertyListingRegion | "",
                      }))
                    }
                  >
                    <option value="">
                      Tidak dinyatakan
                    </option>

                    {REGION_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>
                    Status
                  </span>

                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as PropertyListingStatus,
                      }))
                    }
                  >
                    {STATUS_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.cancelButton}
                    onClick={closeForm}
                    disabled={busy}
                  >
                    Batal
                  </button>

                  <button
                    type="submit"
                    disabled={busy}
                  >
                    {busy
                      ? "Menyimpan..."
                      : editingId
                        ? "Simpan perubahan"
                        : "Cipta listing"}
                  </button>
                </div>
              </form>
            )}

            {listingsLoading && (
              <p className={styles.loading}>
                Memuatkan listing anda...
              </p>
            )}

            {!listingsLoading && listings.length === 0 && !formOpen && (
              <p className={styles.empty}>
                Anda belum mempunyai sebarang listing lagi.
              </p>
            )}

            {!listingsLoading && listings.length > 0 && (
              <ul className={styles.listingList}>
                {listings.map((listing) => (
                  <li
                    key={listing.id}
                    className={styles.listingCard}
                  >
                    <div className={styles.listingCardHeader}>
                      <strong>
                        {listing.title}
                      </strong>

                      <span className={styles.statusBadge}>
                        {STATUS_LABEL[listing.status]}
                      </span>
                    </div>

                    <p className={styles.listingMeta}>
                      {listing.listingType === "for_sale" ? "Untuk dijual" : "Untuk disewa"}
                      {listing.price !== null && ` · RM${listing.price.toLocaleString("ms-MY")}`}
                      {listing.district && ` · ${listing.district}`}
                    </p>

                    <div className={styles.listingActions}>
                      <button
                        type="button"
                        onClick={() => openEditForm(listing)}
                        disabled={busy}
                      >
                        Kemas kini
                      </button>

                      <button
                        type="button"
                        className={styles.deleteButton}
                        onClick={() => handleDelete(listing)}
                        disabled={busy}
                      >
                        Padam
                      </button>
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
