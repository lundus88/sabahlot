"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";
import { useAdminGuard } from "@/lib/admin/use-admin-guard";
import {
  computeDailyGrowth,
  computeListingPartnerStatusBreakdown,
  computeRegionBreakdown,
  listProfilesForAdminStats,
  type DailyGrowthPoint,
  type ListingPartnerStatusBreakdown,
  type RegionBreakdownPoint,
} from "@/lib/admin/dashboard-stats-repository";
import {
  listAllListingPartnersRow,
  listActivePropertyListingsRow,
} from "@/lib/listing-partners";
import { REGION_DEFINITIONS } from "@/lib/region/regionStorage";

import styles from "./admin-dashboard.module.css";

const LISTING_PARTNER_STATUS_LABEL: Record<keyof ListingPartnerStatusBreakdown, string> = {
  pending: "Menunggu kelulusan",
  approved: "Diluluskan",
  suspended: "Digantung",
  rejected: "Tidak diluluskan",
};

const REGION_BREAKDOWN_LABEL: Record<RegionBreakdownPoint["region"], string> = {
  sabah: REGION_DEFINITIONS.sabah.label.ms,
  sarawak: REGION_DEFINITIONS.sarawak.label.ms,
  peninsular: REGION_DEFINITIONS.peninsular.label.ms,
  unspecified: "Tidak dinyatakan",
};

interface DashboardStats {
  memberTotal: number;
  dailyGrowth: DailyGrowthPoint[];
  listingPartnerBreakdown: ListingPartnerStatusBreakdown;
  activeListingCount: number;
  regionBreakdown: RegionBreakdownPoint[];
}

// Hand-built, no charting library (Design decision 3) -- a plain SVG bar
// per day, scaled to the window's own max. A window with zero signups
// anywhere (max === 0) renders flat bars rather than dividing by zero.
function GrowthChart({ points }: { points: DailyGrowthPoint[] }) {
  const max =
    Math.max(1, ...points.map((p) => p.count));

  const barWidth =
    100 / points.length;

  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      width="100%"
      height="120"
      role="img"
      aria-label="Carta pertumbuhan ahli 30 hari lepas"
    >
      {points.map((point, index) => {
        const heightPct =
          (point.count / max) * 36;

        return (
          <rect
            key={point.date}
            x={index * barWidth + barWidth * 0.12}
            y={40 - heightPct}
            width={barWidth * 0.76}
            height={Math.max(heightPct, 0.6)}
            rx={0.6}
            fill="#2563eb"
          >
            <title>
              {point.date}: {point.count}
            </title>
          </rect>
        );
      })}
    </svg>
  );
}

export default function AdminDashboardPage() {
  const {
    sessionChecked,
    currentUserId,
    roleChecked,
    isAdmin,
  } = useAdminGuard();

  const [
    statsLoading,
    setStatsLoading,
  ] = useState(true);

  const [
    stats,
    setStats,
  ] = useState<DashboardStats | null>(null);

  const [
    loadError,
    setLoadError,
  ] = useState("");

  // Once confirmed admin, load every stats source in parallel and
  // derive every chart/breakdown from the raw rows. land_records is
  // never queried, referenced, or aggregated here (Security invariant).
  useEffect(() => {
    if (
      !isAdmin
    ) {
      return;
    }

    let active =
      true;

    const loadStats =
      async () => {
        setStatsLoading(true);
        setLoadError("");

        const supabase =
          createClient();

        const [
          profilesResult,
          partnersResult,
          activeListingsResult,
        ] =
          await Promise.all([
            listProfilesForAdminStats(supabase),
            listAllListingPartnersRow(supabase),
            listActivePropertyListingsRow(supabase),
          ]);

        if (
          !active
        ) {
          return;
        }

        if (
          !profilesResult.ok ||
          !partnersResult.ok ||
          !activeListingsResult.ok
        ) {
          setLoadError(
            "Tidak dapat memuatkan sebahagian statistik. Sila muat semula halaman ini.",
          );
          setStatsLoading(false);
          return;
        }

        setStats({
          memberTotal: profilesResult.data.length,
          dailyGrowth: computeDailyGrowth(profilesResult.data),
          listingPartnerBreakdown: computeListingPartnerStatusBreakdown(
            partnersResult.data,
          ),
          activeListingCount: activeListingsResult.data.length,
          regionBreakdown: computeRegionBreakdown(profilesResult.data),
        });
        setStatsLoading(false);
      };

    void loadStats();

    return () => {
      active =
        false;
    };
  }, [isAdmin]);

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
                Papan Pemuka Admin
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
            Papan Pemuka Admin
          </h1>

          <p>
            Ringkasan operasi -- pertumbuhan ahli, status rakan kongsi
            senarai hartanah, dan penyenaraian aktif. Paparan baca sahaja.
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
              Sila log masuk dengan akaun pentadbir untuk mengakses papan
              pemuka ini.
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
              Akaun anda tidak mempunyai akses pentadbir untuk papan pemuka
              ini.
            </p>
          </section>
        )}

        {sessionChecked && currentUserId && roleChecked && isAdmin && (
          <>
            {statsLoading && (
              <p className={styles.loading}>
                Memuatkan statistik...
              </p>
            )}

            {!statsLoading && loadError && (
              <p
                className={styles.error}
                role="alert"
              >
                {loadError}
              </p>
            )}

            {!statsLoading && !loadError && stats && (
              <>
                <div className={styles.statGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>
                      Jumlah Ahli Berdaftar
                    </span>

                    <span className={styles.statValue}>
                      {stats.memberTotal}
                    </span>
                  </div>

                  <div className={styles.statCard}>
                    <span className={styles.statLabel}>
                      Penyenaraian Aktif
                    </span>

                    <span className={styles.statValue}>
                      {stats.activeListingCount}
                    </span>
                  </div>
                </div>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    Pertumbuhan Ahli (30 Hari Lepas)
                  </h2>

                  <div className={styles.chartCard}>
                    <GrowthChart points={stats.dailyGrowth} />

                    <div className={styles.chartAxis}>
                      <span>
                        {stats.dailyGrowth[0]?.date}
                      </span>

                      <span>
                        {stats.dailyGrowth[stats.dailyGrowth.length - 1]?.date}
                      </span>
                    </div>
                  </div>
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    Rakan Kongsi Senarai Hartanah Mengikut Status
                  </h2>

                  <div className={styles.breakdownCard}>
                    <div className={styles.breakdownGrid}>
                      {(
                        Object.keys(LISTING_PARTNER_STATUS_LABEL) as Array<
                          keyof ListingPartnerStatusBreakdown
                        >
                      ).map((status) => (
                        <div
                          key={status}
                          className={styles.breakdownRow}
                        >
                          <span className={styles.breakdownRowLabel}>
                            {LISTING_PARTNER_STATUS_LABEL[status]}
                          </span>

                          <span className={styles.breakdownRowValue}>
                            {stats.listingPartnerBreakdown[status]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>
                    Ahli Mengikut Wilayah
                  </h2>

                  <div className={styles.breakdownCard}>
                    <div className={styles.breakdownGrid}>
                      {stats.regionBreakdown.map((point) => (
                        <div
                          key={point.region}
                          className={styles.breakdownRow}
                        >
                          <span className={styles.breakdownRowLabel}>
                            {REGION_BREAKDOWN_LABEL[point.region]}
                          </span>

                          <span className={styles.breakdownRowValue}>
                            {point.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <footer className={styles.footer}>
          SabahLot powered by Myukur · Preliminary Alpha
        </footer>
      </section>
    </main>
  );
}
