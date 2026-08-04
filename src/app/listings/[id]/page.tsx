"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useEffect,
  useState,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";
import {
  getActiveListingContact,
  getPropertyListingById,
  mapPropertyListingRow,
  type PropertyListing,
  type PropertyListingContact,
} from "@/lib/listing-partners";

import styles from "../listings.module.css";

const REGION_LABEL: Record<string, string> = {
  sabah: "Sabah",
  sarawak: "Sarawak",
  peninsular: "Semenanjung",
};

export default function ListingDetailPage() {
  const params =
    useParams<{ id: string }>();

  const listingId =
    params.id;

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    notFound,
    setNotFound,
  ] = useState(false);

  const [
    listing,
    setListing,
  ] = useState<PropertyListing | null>(null);

  const [
    contactLoading,
    setContactLoading,
  ] = useState(false);

  const [
    contactRequested,
    setContactRequested,
  ] = useState(false);

  const [
    contact,
    setContact,
  ] = useState<PropertyListingContact | null>(null);

  const [
    contactError,
    setContactError,
  ] = useState("");

  // Fully public page -- no session check. getPropertyListingById is
  // RLS-scoped to property_listings_select_public for an anon caller, so
  // a draft/removed/stale-past-90-day/non-existent id all return `null`
  // here identically -- rendered as the same "not found" state below,
  // never distinguished (Design decision 4 in the sprint brief).
  useEffect(() => {
    if (
      !listingId
    ) {
      return;
    }

    let active =
      true;

    const loadListing =
      async () => {
        const supabase =
          createClient();

        const result =
          await getPropertyListingById(
            supabase,
            listingId,
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
          setListing(
            mapPropertyListingRow(result.data),
          );
        } else {
          setNotFound(true);
        }

        setLoading(false);
      };

    void loadListing();

    return () => {
      active =
        false;
    };
  }, [listingId]);

  // Contact reveal is explicit only -- never called on page load
  // (Design decision 3 in the sprint brief).
  const revealContact =
    async () => {
      setContactRequested(true);
      setContactLoading(true);
      setContactError("");

      const supabase =
        createClient();

      const result =
        await getActiveListingContact(
          supabase,
          listingId,
        );

      if (
        result.ok &&
        result.data
      ) {
        setContact(result.data);
      } else {
        setContactError(
          "Maklumat hubungan tidak didedahkan oleh rakan kongsi ini buat masa ini.",
        );
      }

      setContactLoading(false);
    };

  return (
    <main className={styles.page}>
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
              Direktori Hartanah
            </small>
          </span>
        </div>

        <Link
          href="/listings"
          className={styles.mapLink}
        >
          Kembali ke direktori
        </Link>
      </header>

      {loading && (
        <p className={styles.loading}>
          Memuatkan listing...
        </p>
      )}

      {!loading && notFound && (
        <div className={styles.intro}>
          <h1>
            Listing tidak ditemui
          </h1>

          <p>
            Listing ini tidak wujud, telah ditarik balik, atau tidak lagi
            aktif.
          </p>

          <Link
            href="/listings"
            className={styles.mapLink}
          >
            Kembali ke direktori
          </Link>
        </div>
      )}

      {!loading && !notFound && listing && (
        <>
          <div className={styles.intro}>
            <span className={styles.eyebrow}>
              {listing.listingType === "for_sale" ? "Untuk dijual" : "Untuk disewa"}
              {listing.region && ` · ${REGION_LABEL[listing.region] ?? listing.region}`}
            </span>

            <h1>
              {listing.title}
            </h1>

            {listing.price !== null && (
              <p className={styles.price}>
                RM{listing.price.toLocaleString("ms-MY")}
              </p>
            )}

            <p className={styles.location}>
              {[listing.village, listing.district].filter(Boolean).join(", ") ||
                "Lokasi tidak dinyatakan"}
            </p>

            {listing.description && (
              <p className={styles.description}>
                {listing.description}
              </p>
            )}
          </div>

          <section className={styles.contactSection}>
            {!contactRequested && (
              <button
                type="button"
                className={styles.revealButton}
                onClick={revealContact}
              >
                Papar maklumat hubungan
              </button>
            )}

            {contactRequested && contactLoading && (
              <p className={styles.loading}>
                Memuatkan maklumat hubungan...
              </p>
            )}

            {contactRequested && !contactLoading && contact && (
              <div className={styles.contactCard}>
                <strong>
                  {contact.companyName || contact.displayName}
                </strong>

                {contact.companyName && (
                  <span className={styles.contactSubName}>
                    {contact.displayName}
                  </span>
                )}

                <a href={`tel:${contact.phone}`}>
                  {contact.phone}
                </a>

                <a href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              </div>
            )}

            {contactRequested && !contactLoading && contactError && (
              <p
                className={styles.error}
                role="alert"
              >
                {contactError}
              </p>
            )}
          </section>
        </>
      )}

      <footer className={styles.footer}>
        SabahLot powered by Myukur · Preliminary Alpha
      </footer>
    </main>
  );
}
