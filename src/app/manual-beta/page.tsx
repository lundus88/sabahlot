import Link from "next/link";

import styles from "./manual-beta.module.css";

export const metadata = {
  title: "Manual Pengguna Beta — SabahLot GPS",
};

export default function ManualBetaPage() {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <Link href="/" className={styles.backLink}>
          ← Kembali ke peta
        </Link>

        <span className={styles.badge}>Beta Public Testing — Preliminary Only</span>

        <h1>Manual Pengguna Beta SabahLot GPS</h1>
        <p>
          Ringkasan langkah menggunakan SabahLot Beta di beta.sabahlot.com.
          Manual penuh disimpan dalam repositori projek pada laluan berikut:
        </p>
        <code className={styles.docPath}>
          docs/manual-pengguna-beta-sabahlot-gps.md
        </code>

        <h2>1. Mula</h2>
        <ol>
          <li>Buka https://beta.sabahlot.com pada telefon atau tablet.</li>
          <li>Benarkan kebenaran GPS/lokasi apabila diminta.</li>
          <li>Benarkan kebenaran kamera untuk fungsi AR Guide (jika digunakan).</li>
        </ol>

        <h2>2. Fungsi Utama</h2>
        <ul>
          <li>Start GPS — mula jejak lokasi semasa anda.</li>
          <li>Mark Point — tanda titik semasa di lokasi anda berdiri.</li>
          <li>Set / Import Target — tetapkan atau import titik sasaran.</li>
          <li>Import CSV / KML / DXF — import data lot atau titik sedia ada.</li>
          <li>Use as Target — jadikan titik terpilih sebagai sasaran aktif.</li>
          <li>Find Point — cari dan tunjuk arah ke titik sasaran.</li>
          <li>AR Guide — panduan augmented reality ke arah sasaran.</li>
          <li>Back to Map — kembali ke peta; sasaran aktif akan kekal.</li>
          <li>Save / Export — simpan atau eksport CSV / KML / GeoJSON / PDF.</li>
        </ul>

        <h2>3. Maklum Balas</h2>
        <p>
          Gunakan butang <strong>Feedback Beta</strong> untuk hantar maklum
          balas am, atau <strong>Report Issue</strong> untuk laporkan pepijat
          dengan maklumat teknikal automatik. Semua maklum balas disimpan
          pada peranti anda sahaja.
        </p>

        <h2>4. Troubleshooting</h2>
        <ul>
          <li>Jika GPS tidak tepat, pastikan anda berada di kawasan terbuka.</li>
          <li>Jika kamera AR Guide tidak berfungsi, semak kebenaran kamera browser.</li>
          <li>Jika sasaran hilang selepas refresh, buka semula Find Point / Use as Target.</li>
        </ul>

        <p className={styles.disclaimer}>
          Penafian: SabahLot Beta adalah untuk Preliminary Field Assist /
          rujukan awal sahaja. Ia bukan pengukuran kadaster, bukan
          penentuan sempadan sah, bukan sistem rasmi JTU Sabah, dan bukan
          pengganti juruukur berlesen, peguam, proses pejabat tanah, PBT,
          atau kelulusan JTU Sabah. Semua koordinat, peta, GPS, AR Guide,
          import KML/CSV/DXF dan laporan adalah untuk ujian beta / rujukan
          awal sahaja.
        </p>
      </div>
    </main>
  );
}
