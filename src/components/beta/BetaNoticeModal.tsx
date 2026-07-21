"use client";

import { useEffect, useState } from "react";

import {
  acceptBetaNotice,
  hasAcceptedBetaNotice,
} from "@/lib/beta/betaNoticeStorage";
import { useAppBrandLabel } from "@/lib/branding/appBrandLabel";

export default function BetaNoticeModal() {
  const [visible, setVisible] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const brandLabel = useAppBrandLabel("SabahLot Beta");
  const noticeHeading = useAppBrandLabel("Notis Beta Awam SabahLot");
  const testingPhaseWord = useAppBrandLabel("beta");

  useEffect(() => {
    if (!hasAcceptedBetaNotice()) {
      queueMicrotask(() => {
        setVisible(true);
      });
    }
  }, []);

  if (!visible) {
    return null;
  }

  const handleContinue = () => {
    if (!agreed) {
      return;
    }

    acceptBetaNotice();
    setVisible(false);
  };

  return (
    <div className="sl-beta-notice-backdrop" role="presentation">
      <div
        className="sl-beta-notice-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sl-beta-notice-title"
      >
        <h2 id="sl-beta-notice-title">{noticeHeading}</h2>

        <p>
          {brandLabel} adalah untuk <strong>Preliminary Field Assist</strong> /
          rujukan awal sahaja.
        </p>

        <ul>
          <li>Ia bukan pengukuran kadaster.</li>
          <li>Ia bukan penentuan sempadan sah.</li>
          <li>
            Ia bukan sistem rasmi Jabatan Tanah dan Ukur Sabah (JTU Sabah).
          </li>
          <li>
            Ia bukan pengganti juruukur berlesen, peguam, proses Pejabat
            Tanah, Pihak Berkuasa Tempatan (PBT), atau kelulusan JTU Sabah.
          </li>
        </ul>

        <p>
          Semua koordinat, peta, GPS, AR Guide, import KML/CSV/DXF dan
          laporan adalah untuk ujian {testingPhaseWord} / rujukan awal sahaja.
        </p>

        <label className="sl-beta-notice-checkbox">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => setAgreed(event.target.checked)}
          />
          <span>
            Saya faham dan bersetuju menggunakan {brandLabel} sebagai
            rujukan awal sahaja.
          </span>
        </label>

        <button
          type="button"
          className="sl-beta-notice-continue"
          disabled={!agreed}
          onClick={handleContinue}
        >
          Saya Faham, Teruskan
        </button>
      </div>
    </div>
  );
}
