"use client";

import {
  useMemo,
  useState,
} from "react";

type ProposedLotPurpose =
  | "House Site"
  | "Family Allocation"
  | "Agriculture"
  | "Access Reserve"
  | "Other";

interface ProposedSubLot {
  id: string;
  label: string;
  recipient: string;
  purpose: ProposedLotPurpose;
  areaSqm: string;
  notes: string;
}

function createProposedLot(
  index: number,
): ProposedSubLot {
  const label =
    String.fromCharCode(
      65 + index,
    );

  return {
    id: `sub-lot-${Date.now()}-${index}`,
    label: `Lot ${label}`,
    recipient: "",
    purpose: "Family Allocation",
    areaSqm: "",
    notes: "",
  };
}

export default function PecahGeranPlannerPanel() {
  const [
    isOpen,
    setIsOpen,
  ] =
    useState(false);

  const [
    parentLotName,
    setParentLotName,
  ] =
    useState("");

  const [
    parentAreaSqm,
    setParentAreaSqm,
  ] =
    useState("");

  const [
    accessNote,
    setAccessNote,
  ] =
    useState("");

  const [
    proposedLots,
    setProposedLots,
  ] =
    useState<ProposedSubLot[]>([
      createProposedLot(0),
      createProposedLot(1),
    ]);

  const totalProposedArea =
    useMemo(
      () =>
        proposedLots.reduce(
          (sum, lot) =>
            sum +
            (
              Number(lot.areaSqm) || 0
            ),
          0,
        ),
      [proposedLots],
    );

  const parentArea =
    Number(parentAreaSqm) || 0;

  const balanceArea =
    parentArea > 0
      ? parentArea - totalProposedArea
      : null;

  const addProposedLot =
    () => {
      setProposedLots(
        (current) => [
          ...current,
          createProposedLot(
            current.length,
          ),
        ],
      );
    };

  const removeProposedLot =
    (id: string) => {
      setProposedLots(
        (current) =>
          current.length <= 1
            ? current
            : current.filter(
                (lot) =>
                  lot.id !== id,
              ),
      );
    };

  const updateProposedLot =
    (
      id: string,
      updates: Partial<ProposedSubLot>,
    ) => {
      setProposedLots(
        (current) =>
          current.map((lot) =>
            lot.id === id
              ? {
                  ...lot,
                  ...updates,
                }
              : lot,
          ),
      );
    };

  return (
    <section
      className={
        isOpen
          ? "sl-pecah-geran-panel is-open"
          : "sl-pecah-geran-panel"
      }
    >
      <button
        type="button"
        className="sl-pecah-geran-toggle"
        onClick={() =>
          setIsOpen(
            (value) => !value,
          )
        }
      >
        <span>
          Pecah Geran Planner
        </span>
        <strong>
          {isOpen ? "Close" : "Open"}
        </strong>
      </button>

      {isOpen && (
        <div className="sl-pecah-geran-body">
          <header className="sl-pecah-geran-header">
            <h3>
              Preliminary Pecah Geran Planner
            </h3>
            <p>
              Cadangan awal pecah geran / pembahagian lot. Bukan pelan ukur sah
              dan bukan kelulusan rasmi.
            </p>
          </header>

          <div className="sl-pecah-geran-warning">
            Output ini adalah preliminary sahaja. Ia bukan pelan ukur sah,
            bukan bukti sempadan, bukan pengesahan hakmilik, dan bukan
            kelulusan JTU / PBT / pihak berkuasa. Semua cadangan perlu disemak
            oleh juruukur berlesen atau pihak profesional berkaitan.
          </div>

          <div className="sl-pecah-geran-grid">
            <label>
              Parent Lot Name
              <input
                value={parentLotName}
                onChange={(event) =>
                  setParentLotName(
                    event.target.value,
                  )
                }
                placeholder="Contoh: Lot keluarga / NT / CL"
              />
            </label>

            <label>
              Parent Area Approx. sqm
              <input
                value={parentAreaSqm}
                onChange={(event) =>
                  setParentAreaSqm(
                    event.target.value,
                  )
                }
                inputMode="decimal"
                placeholder="Contoh: 10000"
              />
            </label>
          </div>

          <div className="sl-pecah-geran-section-title">
            Proposed Sub-Lots
          </div>

          <div className="sl-pecah-geran-lots">
            {proposedLots.map(
              (lot) => (
                <article
                  key={lot.id}
                  className="sl-pecah-geran-lot-card"
                >
                  <div className="sl-pecah-geran-lot-head">
                    <input
                      value={lot.label}
                      onChange={(event) =>
                        updateProposedLot(
                          lot.id,
                          {
                            label:
                              event.target.value,
                          },
                        )
                      }
                    />

                    <button
                      type="button"
                      onClick={() =>
                        removeProposedLot(
                          lot.id,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>

                  <label>
                    Proposed Recipient / Owner
                    <input
                      value={lot.recipient}
                      onChange={(event) =>
                        updateProposedLot(
                          lot.id,
                          {
                            recipient:
                              event.target.value,
                          },
                        )
                      }
                      placeholder="Nama penerima / ahli keluarga"
                    />
                  </label>

                  <div className="sl-pecah-geran-grid">
                    <label>
                      Purpose
                      <select
                        value={lot.purpose}
                        onChange={(event) =>
                          updateProposedLot(
                            lot.id,
                            {
                              purpose:
                                event.target.value as ProposedLotPurpose,
                            },
                          )
                        }
                      >
                        <option value="House Site">
                          House Site
                        </option>
                        <option value="Family Allocation">
                          Family Allocation
                        </option>
                        <option value="Agriculture">
                          Agriculture
                        </option>
                        <option value="Access Reserve">
                          Access Reserve
                        </option>
                        <option value="Other">
                          Other
                        </option>
                      </select>
                    </label>

                    <label>
                      Area Approx. sqm
                      <input
                        value={lot.areaSqm}
                        onChange={(event) =>
                          updateProposedLot(
                            lot.id,
                            {
                              areaSqm:
                                event.target.value,
                            },
                          )
                        }
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <label>
                    Notes
                    <textarea
                      value={lot.notes}
                      onChange={(event) =>
                        updateProposedLot(
                          lot.id,
                          {
                            notes:
                              event.target.value,
                          },
                        )
                      }
                      placeholder="Catatan awal / isu keluarga / akses / dokumen"
                    />
                  </label>
                </article>
              ),
            )}
          </div>

          <button
            type="button"
            className="sl-pecah-geran-add"
            onClick={addProposedLot}
          >
            + Add Proposed Sub-Lot
          </button>

          <label className="sl-pecah-geran-access">
            Access / Road Reserve Notes
            <textarea
              value={accessNote}
              onChange={(event) =>
                setAccessNote(
                  event.target.value,
                )
              }
              placeholder="Contoh: laluan masuk sedia ada, cadangan reserve, perlu semakan PBT/JTU"
            />
          </label>

          <div className="sl-pecah-geran-summary">
            <strong>
              Preliminary Area Summary
            </strong>

            <div>
              Parent Area:
              <span>
                {parentArea > 0
                  ? `${parentArea.toLocaleString()} sqm`
                  : "Not set"}
              </span>
            </div>

            <div>
              Total Proposed:
              <span>
                {totalProposedArea.toLocaleString()} sqm
              </span>
            </div>

            <div>
              Balance:
              <span>
                {balanceArea !== null
                  ? `${balanceArea.toLocaleString()} sqm`
                  : "Not available"}
              </span>
            </div>
          </div>

          <div className="sl-pecah-geran-risk">
            Professional review required before official use.
          </div>
        </div>
      )}
    </section>
  );
}
