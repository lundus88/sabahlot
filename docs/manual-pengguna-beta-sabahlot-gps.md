# Manual Pengguna Beta — SabahLot GPS

Versi: Sprint 07A — Public Beta Readiness
Untuk: beta.sabahlot.com

## Penafian

SabahLot Beta adalah untuk **Preliminary Field Assist / rujukan awal sahaja**.

- Ia bukan pengukuran kadaster.
- Ia bukan penentuan sempadan sah.
- Ia bukan sistem rasmi JTU Sabah.
- Ia bukan pengganti juruukur berlesen, peguam, proses pejabat tanah, PBT, atau kelulusan JTU Sabah.

Semua koordinat, peta, GPS, AR Guide, import KML/CSV/DXF dan laporan adalah untuk ujian beta / rujukan awal sahaja.

## 1. Buka Aplikasi

1. Buka `https://beta.sabahlot.com` menggunakan telefon atau tablet.
2. Baca dan setuju dengan Notis Beta yang dipaparkan pada kali pertama.
3. Benarkan kebenaran **GPS / lokasi** apabila diminta oleh browser.
4. Benarkan kebenaran **kamera** apabila menggunakan AR Guide.

## 2. Start GPS

- Buka panel **Handheld GPS**.
- Tekan **Start GPS** / mula jejak untuk mula menerima bacaan lokasi semasa.
- Perhatikan gred ketepatan (A/B/C/D) dan nilai ketepatan (+/- meter) sebelum merekod titik.

## 3. Mark Point

- Semasa GPS aktif, tekan **Mark Point** untuk merekod titik semasa lokasi anda berdiri.
- Titik yang direkod akan disenaraikan dalam panel Handheld GPS.

## 4. Set / Import Target

- **Key-in target**: masukkan koordinat sasaran secara manual.
- **Import CSV / KML / DXF**: import fail titik atau polygon sedia ada melalui panel import.
- Selepas import berjaya, semak pratonton geometri sebelum digunakan.

## 5. Use as Target

- Pilih titik (daripada Mark Point atau import) dan tekan **Use as Target** untuk jadikan ia sasaran aktif.
- Sasaran aktif akan kekal walaupun anda kembali ke peta (**Back to Map**) atau refresh browser.

## 6. Find Point

- Tekan **Find Point** untuk melihat jarak dan arah (bearing) ke sasaran aktif dari lokasi GPS semasa anda.

## 7. AR Guide

- Tekan **Start AR Stake Out** / AR Guide untuk membuka panduan augmented reality.
- Ikut anak panah pada skrin untuk berjalan ke arah sasaran.
- AR Guide memerlukan kebenaran kamera dan sensor orientasi peranti.

## 8. Back to Map

- Tekan **Back to Map** untuk kembali ke paparan peta.
- Sasaran aktif dan titik yang direkod akan kekal tersimpan pada peranti.

## 9. Save / Export

- Simpan rekod lot secara tempatan (localStorage) menggunakan **Save Lot**.
- Eksport data menggunakan salah satu format berikut:
  - **CSV** — senarai koordinat titik.
  - **KML** — untuk paparan dalam Google Earth / GIS.
  - **GeoJSON** — untuk kegunaan GIS lanjutan.
  - **PDF** — pelan awal untuk cetakan / rujukan.

## 10. Troubleshooting

| Masalah | Cadangan |
| --- | --- |
| GPS tidak tepat / accuracy tinggi | Berpindah ke kawasan terbuka, jauh dari bangunan/pokok tebal. |
| Kamera AR Guide tidak berfungsi | Semak kebenaran kamera pada tetapan browser peranti. |
| Sasaran hilang selepas refresh | Buka semula panel Handheld GPS; sasaran aktif sepatutnya dipulihkan automatik. |
| Import fail gagal | Pastikan format fail (CSV/KML/DXF) adalah sah dan tidak rosak. |
| Eksport tidak lengkap | Pastikan sekurang-kurangnya satu polygon/titik aktif sebelum eksport. |

## 11. Format Maklum Balas

Gunakan butang **Feedback Beta** atau **Report Issue** dalam aplikasi. Sertakan:

- Nama dan No. Telefon / WhatsApp (pilihan, untuk susulan).
- Lokasi ujian.
- Jenis telefon dan browser.
- Fungsi yang diuji.
- Jenis isu: Critical / Major / Minor / Suggestion.
- Penerangan masalah dan cadangan.

Maklum balas disimpan pada peranti (localStorage) sahaja buat masa ini dan boleh dieksport ke CSV oleh pasukan projek.

## Penafian Penuh

SabahLot Beta output adalah untuk rujukan awal sahaja. Ia bukan pelan ukur rasmi, bukan pelan sempadan bertauliah, dan tidak boleh digunakan sebagai bukti sah sempadan, pemilikan, kelulusan, pecahan atau status geran tanah. Semua koordinat, sempadan dan keluasan mesti disahkan oleh pihak berkuasa berkaitan, juruukur berlesen atau penasihat profesional sebelum sebarang kegunaan rasmi.
