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
  listActivePropertyListingsRow,
  mapPropertyListingRow,
  type PropertyListing,
} from "@/lib/listing-partners";

import styles from "./listings.module.css";

export default function ListingsDirectoryPage() {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    listings,
    setListings,
  ] = useState<PropertyListing[]>([]);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  // Fully public page -- no session check anywhere. `anon` reaches this
  // data entirely through property_listings_select_public's RLS.
  useEffect(() => {
    let active =
      true;

    const loadListings =
      async () => {
        const supabase =
          createClient();

        const result =
          await listActivePropertyListingsRow(supabase);

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
        } else {
          setErrorMessage(
            "Tidak dapat memuatkan senarai hartanah buat masa ini. Sila cuba lagi sebentar lagi.",
          );
        }

        setLoading(false);
      };

    void loadListings();

    return () => {
      active =
        false;
    };
  }, []);

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
          Direktori Hartanah
        </h1>

        <p>
          Senarai hartanah/tanah daripada rakan kongsi SabahLot yang telah
          diluluskan.
        </p>
      </div>

      {loading && (
        <p className={styles.loading}>
          Memuatkan senarai hartanah...
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

      {!loading && !errorMessage && listings.length === 0 && (
        <p className={styles.empty}>
          Tiada listing aktif buat masa ini. Sila kembali semula kemudian.
        </p>
      )}

      {!loading && listings.length > 0 && (
        <ul className={styles.grid}>
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/listings/${listing.id}`}
                className={styles.card}
              >
                <span className={styles.typeBadge}>
                  {listing.listingType === "for_sale" ? "Untuk dijual" : "Untuk disewa"}
                </span>

                <strong>
                  {listing.title}
                </strong>

                <p className={styles.cardMeta}>
                  {listing.price !== null && `RM${listing.price.toLocaleString("ms-MY")}`}
                  {listing.price !== null && (listing.district || listing.village) && " · "}
                  {[listing.village, listing.district].filter(Boolean).join(", ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <footer className={styles.footer}>
        SabahLot powered by Myukur · Preliminary Alpha
      </footer>
    </main>
  );
}
