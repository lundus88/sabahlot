 "use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import Map, {
  formatAreaDisplay,
} from "./components/Map";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  deleteLocalLot,
  getLocalLots,
  type LocalLotRecord,
  markLocalLotSynced,
  saveLocalLot,
} from "@/lib/local-lots";

import type {
  AppLanguage,
  AreaUnit,
  Coordinate,
  PolygonResult,
} from "./components/Map";

interface LotFormData {
  ownerName: string;
  lotNumber: string;
  village: string;
  district: string;
}

interface SavedLotRecord extends LotFormData {
  polygon: PolygonResult | null;
  savedAt: string;
}

interface PreviousSavedLotRecord {
  ownerName?: string;
  lotName?: string;
  lotNumber?: string;
  village?: string;
  district?: string;
  polygon?: PolygonResult | null;
  savedAt?: string;
}

interface PolygonGeoJson {
  type: "Polygon";
  coordinates: number[][][];
}

interface SupabaseLotRecord {
  id: string;
  lot_name: string;
  polygon_geojson: PolygonGeoJson;
  area_m2: number;
  area_ha: number;
  area_acre: number;
  created_at: string;
}

type OutputFormat =
  | "pdf"
  | "kml"
  | "dxf";

type PdfPaperSize =
  | "a4"
  | "a3"
  | "a2"
  | "a1"
  | "a0";

type PdfOrientation =
  | "portrait"
  | "landscape";

type PlanTemplate =
  "preliminary-lot-plan";

type IdentityDisplayMode =
  | "full"
  | "masked"
  | "hidden";

interface PdfIdentityFields {
  surveyor: string;
  witness: string;
  villageHead: string;
  applicant: string;
}

const STORAGE_KEY =
  "sabahlot-alpha-record";

const IS_DEVELOPMENT =
  process.env.NODE_ENV ===
  "development";

const DEVELOPMENT_DEMO_USER_ID =
  "00000000-0000-4000-8000-000000000001";

const EMPTY_FORM: LotFormData = {
  ownerName: "",
  lotNumber: "",
  village: "",
  district: "",
};

const EMPTY_PDF_IDENTITIES: PdfIdentityFields = {
  surveyor: "",
  witness: "",
  villageHead: "",
  applicant: "",
};

const PAGE_TEXT = {
  en: {
    panelTitle:
      "Lot Information",

    panelDescription:
      "Enter the lot details before drawing or saving the land record.",

    ownerName:
      "Owner name",

    lotNumber:
      "Lot number",

    village:
      "Village",

    district:
      "District",

    ownerPlaceholder:
      "Example: Alex Nairing",

    lotPlaceholder:
      "Example: Lot 69467",

    villagePlaceholder:
      "Example: Kg. Kinabalu",

    districtPlaceholder:
      "Example: Kota Marudu",

    save:
      "Save Lot",

    saving:
      "Saving...",

    saved:
      "Lot successfully saved on this device.",

    savedSuccessfully:
      "Lot saved successfully.",

    cloudSyncFailed:
      "Saved locally. Cloud sync failed.",

    polygonRequired:
      "Complete the polygon first.",

    saveFailed:
      "Failed to save lot.",

    savedLots:
      "Saved Lots",

    loadLots:
      "Load saved lots",

    loadingLots:
      "Loading lots...",

    noSavedLots:
      "No saved lots yet.",

    loadFailed:
      "Failed to load lot.",

    load:
      "Load",

    delete:
      "Delete",

    deleteFailed:
      "The saved lot could not be deleted.",

    deleted:
      "Local record deleted.",

    loaded:
      "Lot successfully loaded.",

    confirmDelete:
      "Delete this local record?",

    local:
      "Local",

    synced:
      "Synced",

    storedOnDevice:
      "Saved on this device",

    restored:
      "Previous lot details restored.",

    close:
      "Close lot information",

    summary:
      "Drawing summary",

    points:
      "Points",

    area:
      "Area",

    perimeter:
      "Perimeter",

    noPolygon:
      "No completed polygon yet.",

    exportPdf:
      "Export PDF Plan",

    exportingPdf:
      "Generating PDF...",

    exportPdfFailed:
      "The PDF plan could not be generated.",

    exportPdfSuccess:
      "PDF generated successfully.",

    outputOptions:
      "Output options",

    outputLanguage:
      "Report language",

    outputFormat:
      "Output format",

    exportOutput:
      "Generate output",

    exportOutputSuccess:
      "Output generated successfully.",

    clearRecord:
      "Clear saved record",

    confirmClear:
      "Clear the saved lot details on this device?",
  },

  ms: {
    panelTitle:
      "Maklumat Lot",

    panelDescription:
      "Masukkan maklumat lot sebelum melukis atau menyimpan rekod tanah.",

    ownerName:
      "Nama pemilik",

    lotNumber:
      "Nombor lot",

    village:
      "Kampung",

    district:
      "Daerah",

    ownerPlaceholder:
      "Contoh: Alex Nairing",

    lotPlaceholder:
      "Contoh: Lot 69467",

    villagePlaceholder:
      "Contoh: Kg. Kinabalu",

    districtPlaceholder:
      "Contoh: Kota Marudu",

    save:
      "Save Lot",

    saving:
      "Menyimpan...",

    saved:
      "Lot berjaya disimpan dalam peranti.",

    savedSuccessfully:
      "Lot saved successfully.",

    cloudSyncFailed:
      "Saved locally. Cloud sync failed.",

    polygonRequired:
      "Lengkapkan polygon dahulu.",

    saveFailed:
      "Gagal menyimpan lot.",

    savedLots:
      "Saved Lots",

    loadLots:
      "Muat lot tersimpan",

    loadingLots:
      "Memuatkan lot...",

    noSavedLots:
      "Belum ada lot tersimpan.",

    loadFailed:
      "Gagal memuatkan lot.",

    load:
      "Load",

    delete:
      "Delete",

    deleteFailed:
      "Lot tersimpan tidak dapat dipadam.",

    deleted:
      "Rekod tempatan telah dipadam.",

    loaded:
      "Lot berjaya dimuatkan.",

    confirmDelete:
      "Padam rekod tempatan ini?",

    local:
      "Local",

    synced:
      "Synced",

    storedOnDevice:
      "Disimpan dalam peranti",

    restored:
      "Maklumat lot terdahulu dipulihkan.",

    close:
      "Tutup maklumat lot",

    summary:
      "Ringkasan lukisan",

    points:
      "Titik",

    area:
      "Keluasan",

    perimeter:
      "Perimeter",

    noPolygon:
      "Belum ada polygon yang disiapkan.",

    exportPdf:
      "Eksport Pelan PDF",

    exportingPdf:
      "Menjana PDF...",

    exportPdfFailed:
      "Pelan PDF tidak dapat dijana.",

    exportPdfSuccess:
      "PDF berjaya dijana",

    outputOptions:
      "Pilihan output",

    outputLanguage:
      "Bahasa laporan",

    outputFormat:
      "Format output",

    exportOutput:
      "Jana output",

    exportOutputSuccess:
      "Output berjaya dijana.",

    clearRecord:
      "Padam rekod simpanan",

    confirmClear:
      "Padam maklumat lot yang disimpan dalam peranti ini?",
  },
} as const;

function formatNumber(
  value: number,
  language: AppLanguage,
): string {
  return new Intl.NumberFormat(
    language === "en"
      ? "en-MY"
      : "ms-MY",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  ).format(value);
}

function planCodeSuffix(
  source: string,
): string {
  let hash = 2166136261;

  for (
    let index = 0;
    index < source.length;
    index += 1
  ) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash)
    .toString(36)
    .toUpperCase()
    .padStart(6, "0")
    .slice(-6);
}

function maskIdentityNumber(
  value: string,
): string {
  const digits =
    value.replace(
      /\D/g,
      "",
    );

  if (
    digits.length >=
    4
  ) {
    return `******-**-${digits.slice(-4)}`;
  }

  return value.trim()
    ? "******-**-****"
    : "";
}

export default function HomePage() {
  const [
    language,
    setLanguage,
  ] = useState<AppLanguage>("en");

  const [
    lotPanelOpen,
    setLotPanelOpen,
  ] = useState(false);

  const [
    formData,
    setFormData,
  ] = useState<LotFormData>(
    EMPTY_FORM,
  );

  const [
    polygon,
    setPolygon,
  ] = useState<PolygonResult | null>(
    null,
  );

  const [
    saveMessage,
    setSaveMessage,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    isExportingPdf,
    setIsExportingPdf,
  ] = useState(false);

  const [
    savedLots,
    setSavedLots,
  ] = useState<SupabaseLotRecord[]>(
    [],
  );

  const [
    localLots,
    setLocalLots,
  ] = useState<LocalLotRecord[]>([]);

  const [
    isLoadingLots,
    setIsLoadingLots,
  ] = useState(false);

  const [
    loadedCoordinates,
    setLoadedCoordinates,
  ] = useState<Coordinate[]>();

  const [
    outputFormat,
    setOutputFormat,
  ] = useState<OutputFormat>(
    "pdf",
  );

  const [
    pdfPaperSize,
    setPdfPaperSize,
  ] = useState<PdfPaperSize>("a4");

  const [
    pdfOrientation,
    setPdfOrientation,
  ] = useState<PdfOrientation>(
    "landscape",
  );

  const [
    planTemplate,
    setPlanTemplate,
  ] = useState<PlanTemplate>(
    "preliminary-lot-plan",
  );

  const [
    pdfJobTitle,
    setPdfJobTitle,
  ] = useState("");

  const [
    pdfIdentityMode,
    setPdfIdentityMode,
  ] = useState<IdentityDisplayMode>(
    "masked",
  );

  const [
    pdfIdentities,
    setPdfIdentities,
  ] = useState<PdfIdentityFields>(
    EMPTY_PDF_IDENTITIES,
  );

  const [
    selectedAreaUnit,
    setSelectedAreaUnit,
  ] = useState<AreaUnit>("m2");

  const text =
    PAGE_TEXT[language];

  const planTemplateLabel =
    "Preliminary Lot Plan";

  const displayArea = (
    areaM2: number,
    displayLanguage:
      AppLanguage = language,
  ) => {
    const area = formatAreaDisplay(
      areaM2,
      selectedAreaUnit,
      displayLanguage,
    );

    return `${area.text} ${area.symbol}`;
  };

  const visibleCloudLots =
    savedLots.filter(
      (cloudLot) =>
        !localLots.some(
          (localLot) =>
            localLot.sync_status ===
              "synced" &&
            localLot.lot_name ===
              cloudLot.lot_name &&
            Math.abs(
              localLot.area_m2 -
                cloudLot.area_m2,
            ) < 0.01,
        ),
    );

  useEffect(() => {
    try {
      const storedRecord =
        window.localStorage.getItem(
          STORAGE_KEY,
        );

      if (!storedRecord) {
        return;
      }

      const parsedRecord =
        JSON.parse(
          storedRecord,
        ) as PreviousSavedLotRecord;

      setFormData({
        ownerName:
          parsedRecord.ownerName ??
          "",

        lotNumber:
          parsedRecord.lotNumber ??
          parsedRecord.lotName ??
          "",

        village:
          parsedRecord.village ??
          "",

        district:
          parsedRecord.district ??
          "",
      });

      setPolygon(
        parsedRecord.polygon ??
          null,
      );

      if (
        parsedRecord.polygon?.coordinates
      ) {
        setLoadedCoordinates(
          parsedRecord.polygon.coordinates,
        );
      }

      setSaveMessage(
        PAGE_TEXT.en.restored,
      );
    } catch {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );
    }
  }, []);

  useEffect(() => {
    try {
      setLocalLots(getLocalLots());
    } catch {
      setSaveMessage(
        PAGE_TEXT.en.loadFailed,
      );
    }
  }, []);

  useEffect(() => {
    if (
      !polygon ||
      polygon.coordinates.length < 3
    ) {
      return;
    }

    try {
      const draft: SavedLotRecord = {
        ...formData,
        polygon,
        savedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(draft),
      );
    } catch {
      // Explicit Save reports storage failures to the user.
    }
  }, [formData, polygon]);

  useEffect(() => {
    if (!saveMessage) {
      return;
    }

    const timeoutId =
      window.setTimeout(
        () => {
          setSaveMessage("");
        },
        3500,
      );

    return () => {
      window.clearTimeout(
        timeoutId,
      );
    };
  }, [saveMessage]);

  const updateField = (
    field: keyof LotFormData,
    value: string,
  ) => {
    setFormData(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  };

  const updatePdfIdentity = (
    field: keyof PdfIdentityFields,
    value: string,
  ) => {
    setPdfIdentities(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  };

  const openLotPanel =
    () => {
      setLotPanelOpen(true);
    };

  const closeLotPanel =
    () => {
      setLotPanelOpen(false);
    };

  const saveLotRecord = (
    event?:
      FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault();

    const save =
      async () => {
        const lotName =
          formData.lotNumber.trim() ||
          (
            language === "ms"
              ? "Lot Tanpa Nama"
              : "Untitled Lot"
          );

        if (
          !polygon ||
          polygon.coordinates.length <
            3
        ) {
          setSaveMessage(
            text.polygonRequired,
          );

          return;
        }

        setIsSaving(true);

        let localRecord: LocalLotRecord;

        try {
          localRecord = saveLocalLot({
            lotName,
            lotNumber:
              formData.lotNumber,
            ownerName:
              formData.ownerName,
            village:
              formData.village,
            district:
              formData.district,
            polygon,
          });

          setLocalLots(getLocalLots());
        } catch {
          setSaveMessage(
            text.saveFailed,
          );
          setIsSaving(false);
          return;
        }

        if (
          localRecord.sync_status ===
          "synced"
        ) {
          setSaveMessage(
            text.savedSuccessfully,
          );
          setIsSaving(false);
          return;
        }

        try {
          const supabase =
            createClient();

          const {
            data: {
              user,
            },
            error: userError,
          } =
            await supabase.auth.getUser();

          const userId =
            user?.id ??
            (
              IS_DEVELOPMENT
                ? DEVELOPMENT_DEMO_USER_ID
                : null
            );

          if (!userId) {
            console.error(
              "SabahLot cloud sync failed: authenticated user is unavailable.",
              userError
                ? {
                    message:
                      userError.message,
                  }
                : undefined,
            );
            setSaveMessage(
              text.cloudSyncFailed,
            );
            return;
          }

          const ring =
            polygon.coordinates.map(
              (
                coordinate,
              ) => [
                coordinate.lng,
                coordinate.lat,
              ],
            );

          ring.push([
            polygon.coordinates[0].lng,
            polygon.coordinates[0].lat,
          ]);

          const createdAt =
            new Date().toISOString();

          const {
            error,
          } =
            await supabase
              .from("lots")
              .insert({
                user_id:
                  userId,
                lot_name:
                  lotName,
                polygon_geojson: {
                  type:
                    "Polygon",
                  coordinates: [
                    ring,
                  ],
                },
                area_m2:
                  polygon.areaM2,
                area_ha:
                  polygon.areaHa,
                area_acre:
                  polygon.areaAcre,
                created_at:
                  createdAt,
              });

          if (error) {
            console.error(
              "SabahLot cloud sync failed:",
              {
                code: error.code,
                message:
                  error.message,
                details:
                  error.details,
                hint: error.hint,
              },
            );
            setSaveMessage(
              text.cloudSyncFailed,
            );
            return;
          }

          const record:
            SavedLotRecord = {
              ...formData,
              polygon,
              savedAt:
                createdAt,
            };

          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(record),
          );

          setLocalLots(
            markLocalLotSynced(
              localRecord.id,
            ),
          );

          setSaveMessage(
            text.savedSuccessfully,
          );

          if (
            user &&
            !userError
          ) {
            await loadSavedLots();
          }
        } catch (error) {
          console.error(
            "SabahLot cloud sync failed:",
            error,
          );
          setSaveMessage(
            text.cloudSyncFailed,
          );
        } finally {
          setIsSaving(false);
        }
      };

    void save();
  };

  const loadSavedLots =
    async () => {
      setIsLoadingLots(true);

      try {
        setLocalLots(getLocalLots());

        const supabase =
          createClient();

        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          setSavedLots(
            [],
          );

          return;
        }

        const {
          data,
          error,
        } =
          await supabase
            .from("lots")
            .select(
              "id, lot_name, polygon_geojson, area_m2, area_ha, area_acre, created_at",
            )
            .order(
              "created_at",
              {
                ascending:
                  false,
              },
            );

        if (error) {
          setSaveMessage(
            text.loadFailed,
          );

          return;
        }

        setSavedLots(
          (
            data ??
            []
          ) as SupabaseLotRecord[],
        );
      } catch {
        try {
          setLocalLots(getLocalLots());
        } catch {
          setSaveMessage(
            text.loadFailed,
          );
        }
      } finally {
        setIsLoadingLots(false);
      }
    };

  const loadSavedLot = (
    lot: SupabaseLotRecord,
  ) => {
    const ring =
      lot.polygon_geojson
        .coordinates[0] ??
      [];

    const coordinates =
      ring
        .slice(
          0,
          -1,
        )
        .map(
          (
            coordinate,
          ) => ({
            lng:
              coordinate[0],
            lat:
              coordinate[1],
          }),
        );

    setFormData(
      (
        current,
      ) => ({
        ...current,
        lotNumber:
          lot.lot_name,
      }),
    );

    setLoadedCoordinates(
      coordinates,
    );

    setSaveMessage(text.loaded);
  };

  const loadLocalLot = (
    lot: LocalLotRecord,
  ) => {
    try {
      setFormData({
        ownerName: lot.owner_name ?? "",
        lotNumber:
          lot.lot_number ?? lot.lot_name,
        village: lot.village ?? "",
        district: lot.district ?? "",
      });
      setLoadedCoordinates(
        lot.coordinates.map(
          (coordinate) => ({
            ...coordinate,
          }),
        ),
      );
      setSaveMessage(text.loaded);
    } catch {
      setSaveMessage(text.loadFailed);
    }
  };

  const deleteLocalLotRecord = (
    lotId: string,
  ) => {
    if (
      !window.confirm(text.confirmDelete)
    ) {
      return;
    }

    try {
      setLocalLots(deleteLocalLot(lotId));
      setSaveMessage(text.deleted);
    } catch {
      setSaveMessage(text.deleteFailed);
    }
  };

  const deleteSavedLot =
    async (
      lotId: string,
    ) => {
      try {
        const supabase =
          createClient();

        const {
          data: {
            user,
          },
          error: userError,
        } =
          await supabase.auth.getUser();

        if (
          userError ||
          !user
        ) {
          setSaveMessage(
            text.deleteFailed,
          );

          return;
        }

        const {
          error,
        } =
          await supabase
            .from("lots")
            .delete()
            .eq(
              "id",
              lotId,
            );

        if (error) {
          setSaveMessage(
            text.deleteFailed,
          );

          return;
        }

        setSavedLots(
          (
            current,
          ) =>
            current.filter(
              (
                lot,
              ) =>
                lot.id !==
                lotId,
            ),
        );
      } catch {
        setSaveMessage(
          text.deleteFailed,
        );
      }
    };

  const clearSavedRecord =
    () => {
      const confirmed =
        window.confirm(
          text.confirmClear,
        );

      if (!confirmed) {
        return;
      }

      window.localStorage.removeItem(
        STORAGE_KEY,
      );

      setFormData(
        EMPTY_FORM,
      );

      setPolygon(
        null,
      );

      setSaveMessage("");
    };

  const exportPdfPlan =
    async () => {
      if (!polygon) {
        setSaveMessage(
          text.polygonRequired,
        );

        return;
      }

      setIsExportingPdf(true);

      try {
        const [
          {
            default:
              html2canvas,
          },
          {
            jsPDF,
          },
        ] =
          await Promise.all([
            import(
              "html2canvas"
            ),
            import(
              "jspdf"
            ),
          ]);

        const mapElement =
          document.querySelector<HTMLElement>(
            ".sl-map-canvas",
          );

        if (!mapElement) {
          throw new Error(
            "Map element not found",
          );
        }

        const pdf =
          new jsPDF({
            format:
              pdfPaperSize,
            orientation:
              pdfOrientation,
            unit:
              "mm",
          });

        const pageWidth =
          pdf.internal.pageSize.getWidth();

        const pageHeight =
          pdf.internal.pageSize.getHeight();

        const margin =
          Math.max(
            6,
            Math.min(
              8,
              Math.min(
                pageWidth,
                pageHeight,
              ) * 0.025,
            ),
          );
        const printableWidth =
          pageWidth -
          margin *
            2;
        const printableHeight =
          pageHeight -
          margin *
            2;
        const targetMapAspect =
          (
            printableWidth *
            0.69
          ) /
          printableHeight;
        const mapElementWidth =
          mapElement.clientWidth;
        const mapElementHeight =
          mapElement.clientHeight;
        const snapshotPadding =
          Math.min(
            mapElementWidth,
            mapElementHeight,
          ) *
          0.2;
        const cropPaddingX =
          Math.max(
            0,
            (
              mapElementWidth -
              mapElementHeight *
                targetMapAspect
            ) /
              2,
          );
        const cropPaddingY =
          Math.max(
            0,
            (
              mapElementHeight -
              mapElementWidth /
                targetMapAspect
            ) /
              2,
          );

        const prepareMapSnapshot = (
          detail: {
            paddingRatio: number;
            paddingX?: number;
            paddingY?: number;
            overviewZoom?: number;
            overviewOnly?: boolean;
          },
        ) =>
          new Promise<void>(
            (resolve) => {
              window.dispatchEvent(
                new CustomEvent(
                  "sabahlot:prepare-pdf-snapshot",
                  {
                    detail: {
                      ...detail,
                      onReady:
                        resolve,
                    },
                  },
                ),
              );
            },
          );

        await prepareMapSnapshot({
          paddingRatio:
            0.12,
          overviewZoom:
            7,
          overviewOnly:
            true,
        });

        const keyPlanCanvas =
          await html2canvas(
            mapElement,
            {
              backgroundColor:
                "#e2e8f0",
              logging:
                false,
              scale:
                2,
              useCORS:
                true,
            },
          );
        const keyPlanLooksBlank = (() => {
          try {
            const context =
              keyPlanCanvas.getContext(
                "2d",
              );

            if (!context) {
              return true;
            }

            let blankSamples =
              0;
            let totalSamples =
              0;
            const stepX =
              Math.max(
                1,
                Math.floor(
                  keyPlanCanvas.width /
                    14,
                ),
              );
            const stepY =
              Math.max(
                1,
                Math.floor(
                  keyPlanCanvas.height /
                    10,
                ),
              );

            for (
              let y = stepY;
              y < keyPlanCanvas.height;
              y += stepY
            ) {
              for (
                let x = stepX;
                x < keyPlanCanvas.width;
                x += stepX
              ) {
                const [
                  red,
                  green,
                  blue,
                ] =
                  context.getImageData(
                    x,
                    y,
                    1,
                    1,
                  ).data;
                const channelSpread =
                  Math.max(
                    red,
                    green,
                    blue,
                  ) -
                  Math.min(
                    red,
                    green,
                    blue,
                  );
                const greyTile =
                  red > 205 &&
                  green > 205 &&
                  blue > 205 &&
                  channelSpread < 24;

                if (greyTile) {
                  blankSamples +=
                    1;
                }

                totalSamples +=
                  1;
              }
            }

            return totalSamples ===
              0
              ? true
              : blankSamples /
                  totalSamples >
                  0.68;
          } catch {
            return true;
          }
        })();

        await prepareMapSnapshot({
          paddingRatio:
            0.2,
          paddingX:
            Math.max(
              48,
              snapshotPadding +
                cropPaddingX,
            ),
          paddingY:
            Math.max(
              48,
              snapshotPadding +
                cropPaddingY,
            ),
        });

        const mapCanvas =
          await html2canvas(
            mapElement,
            {
              backgroundColor:
                "#e2e8f0",
              logging:
                false,
              scale:
                2,
              useCORS:
                true,
            },
          );

        const lotName =
          formData.lotNumber.trim() ||
          "Untitled Lot";

        const jobTitle =
          pdfJobTitle.trim() ||
          "-";

        const visibleIdentity = (
          value: string,
        ) => {
          if (
            pdfIdentityMode ===
            "hidden"
          ) {
            return "";
          }

          if (
            pdfIdentityMode ===
            "masked"
          ) {
            return maskIdentityNumber(
              value,
            );
          }

          return value.trim();
        };

        const matchingLocalLot =
          localLots.find(
            (lot) =>
              lot.lot_name ===
              lotName,
          );

        const matchingCloudLot =
          savedLots.find(
            (lot) =>
              lot.lot_name ===
              lotName,
          );

        const geometryIdentity =
          polygon.coordinates
            .map(
              (coordinate) =>
                `${coordinate.lat.toFixed(7)},${coordinate.lng.toFixed(7)}`,
            )
            .join("|");

        const planIdentity =
          matchingLocalLot?.id ??
          matchingCloudLot?.id ??
          geometryIdentity;

        const generatedAt =
          new Date();

        const planYear =
          new Date(
            matchingLocalLot?.created_at ??
              matchingCloudLot?.created_at ??
              generatedAt,
          ).getFullYear();

        const planCode =
          `SL-PP-${planYear}-` +
          planCodeSuffix(
            planIdentity,
          );

        const coordinateSystem =
          "WGS 84 / EPSG:4326";

        const scaleDistanceM =
          Math.max(
            10,
            Math.round(
              polygon.perimeterM /
                5 /
                10,
            ) * 10,
          );

        const scaleText =
          `${scaleDistanceM.toLocaleString("en-MY")} m`;

        const disclaimer =
          "DISCLAIMER: This preliminary plan is provided for reference, discussion and early planning purposes only. It is not an official survey plan, does not confirm legal or cadastral boundaries, and must not be used for title registration, legal proceedings or construction without verification by the relevant authorities and qualified professionals.";

        const preliminaryAcknowledgement =
          "The signatories acknowledge that the boundaries, areas and arrangement shown are for preliminary discussion and planning only. Signing does not constitute official boundary confirmation, cadastral approval, transfer of ownership or legal consent.";

        const preliminaryNotice =
          "PRELIMINARY PLAN \u2014 NOT FOR LEGAL OR CADASTRAL USE.";

        const reportText =
          {
            plan:
              planTemplateLabel,
            area:
              "Area",
            coordinates:
              "Coordinate Table",
            point:
              "Point / No.",
            latitude:
              "Latitude",
            longitude:
              "Longitude",
            distance:
              "Segment distance (m)",
            bearing:
              "Bearing",
            z:
              "Z",
            generated:
              "Generated",
          };

        const addDrawingBorder =
          () => {
            const outerBorderMargin =
              Math.max(
                4,
                margin -
                  2,
              );
            const innerBorderMargin =
              margin;

            pdf.setDrawColor(
              15,
              23,
              42,
            );
            pdf.setLineWidth(
              0.7,
            );
            pdf.rect(
              outerBorderMargin,
              outerBorderMargin,
              pageWidth -
                outerBorderMargin *
                  2,
              pageHeight -
                outerBorderMargin *
                  2,
            );
            pdf.setLineWidth(
              0.2,
            );
            pdf.rect(
              innerBorderMargin,
              innerBorderMargin,
              pageWidth -
                innerBorderMargin *
                  2,
              pageHeight -
                innerBorderMargin *
                  2,
            );
          };

        const addFooter =
          () => {
            pdf.setFont(
              "helvetica",
              "bold",
            );
            pdf.setFontSize(
              7,
            );
            pdf.setTextColor(
              185,
              28,
              28,
            );
            pdf.text(
              preliminaryNotice,
              pageWidth /
                2,
              pageHeight -
                12,
              {
                align:
                  "center",
              },
            );

            pdf.setFont(
              "helvetica",
              "normal",
            );
            pdf.setFontSize(
              8,
            );

            pdf.setTextColor(
              100,
              116,
              139,
            );

            pdf.text(
              `${reportText.generated} ${new Date().toLocaleString(
                "en-MY",
              )}`,
              margin,
              pageHeight -
                8,
            );

            pdf.text(
              "SabahLot powered by Myukur",
              pageWidth -
                margin,
              pageHeight -
                8,
              {
                align:
                  "right",
              },
            );
          };

        const addNorthArrow = (
          x: number,
          y: number,
        ) => {
          pdf.setDrawColor(
            15,
            23,
            42,
          );
          pdf.setFillColor(
            15,
            23,
            42,
          );
          pdf.triangle(
            x,
            y,
            x -
              4,
            y +
              14,
            x +
              4,
            y +
              14,
            "F",
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            9,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            "N",
            x,
            y -
              2,
            {
              align:
                "center",
            },
          );
        };

        const addScaleBar = (
          x: number,
          y: number,
        ) => {
          const barWidth =
            42;
          const segmentWidth =
            barWidth /
            4;

          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.setDrawColor(
            15,
            23,
            42,
          );
          pdf.roundedRect(
            x -
              3,
            y -
              3,
            barWidth +
              9,
            18,
            1.5,
            1.5,
            "FD",
          );

          for (
            let index = 0;
            index < 4;
            index += 1
          ) {
            pdf.setFillColor(
              index % 2 ===
                0
                ? 15
                : 255,
              index % 2 ===
                0
                ? 23
                : 255,
              index % 2 ===
                0
                ? 42
                : 255,
            );
            pdf.rect(
              x +
                segmentWidth *
                  index,
              y,
              segmentWidth,
              3,
              "FD",
            );
          }

          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.setFontSize(
            7,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            "0",
            x,
            y +
              7,
          );
          pdf.text(
            scaleText,
            x +
              barWidth,
            y +
              7,
            {
              align:
                "right",
            },
          );
          pdf.text(
            "Scale: Diagrammatic",
            x,
            y +
              12,
          );
        };

        const addKeyPlan = (
          x: number,
          y: number,
          width: number,
          height: number,
          snapshotData: string | null,
        ) => {
          const centre =
            polygon.coordinates.reduce(
              (
                total,
                coordinate,
              ) => ({
                lat:
                  total.lat +
                  coordinate.lat,
                lng:
                  total.lng +
                  coordinate.lng,
              }),
              {
                lat: 0,
                lng: 0,
              },
            );
          const centreLat =
            centre.lat /
            polygon.coordinates.length;
          const centreLng =
            centre.lng /
            polygon.coordinates.length;
          const mapLeft =
            x +
            2;
          const mapTop =
            y +
            7;
          const mapWidth =
            width -
            4;
          const mapHeight =
            height -
            13;

          pdf.setDrawColor(
            100,
            116,
            139,
          );
          pdf.setFillColor(
            248,
            250,
            252,
          );
          pdf.rect(
            x,
            y,
            width,
            height,
            "FD",
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.rect(
            x +
              1,
            y +
              1,
            width -
              2,
            6,
            "F",
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            7,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            "KEY PLAN",
            x +
              3,
            y +
              5,
          );

          pdf.setDrawColor(
            203,
            213,
            225,
          );
          pdf.setLineWidth(
              0.2,
          );
          pdf.rect(
            mapLeft,
            mapTop,
            mapWidth,
            mapHeight,
          );

          let markerX =
            mapLeft +
            mapWidth /
              2;
          let markerY =
            mapTop +
            mapHeight /
              2;

          if (snapshotData) {
            pdf.addImage(
              snapshotData,
              "PNG",
              mapLeft,
              mapTop,
              mapWidth,
              mapHeight,
              undefined,
              "FAST",
            );
          } else {
            const lonMin =
              115;
            const lonMax =
              119.45;
            const latMin =
              3.85;
            const latMax =
              7.45;
            const project = (
              longitude: number,
              latitude: number,
            ) => ({
              x:
                mapLeft +
                ((longitude - lonMin) /
                  (lonMax - lonMin)) *
                  mapWidth,
              y:
                mapTop +
                ((latMax - latitude) /
                  (latMax - latMin)) *
                  mapHeight,
            });
            const sabahOutline: Coordinate[] = [
              { lat: 7.25, lng: 116.75 },
              { lat: 7.1, lng: 117.45 },
              { lat: 6.8, lng: 118.15 },
              { lat: 6.45, lng: 118.75 },
              { lat: 5.95, lng: 119.25 },
              { lat: 5.35, lng: 119.1 },
              { lat: 4.85, lng: 118.55 },
              { lat: 4.45, lng: 117.75 },
              { lat: 4.1, lng: 117.05 },
              { lat: 4.2, lng: 116.35 },
              { lat: 4.7, lng: 115.85 },
              { lat: 5.35, lng: 115.45 },
              { lat: 6.0, lng: 115.35 },
              { lat: 6.55, lng: 115.85 },
              { lat: 7.0, lng: 116.35 },
            ];

            pdf.setFillColor(
              219,
              234,
              254,
            );
            pdf.rect(
              mapLeft,
              mapTop,
              mapWidth,
              mapHeight,
              "F",
            );
            pdf.setDrawColor(
              37,
              99,
              235,
            );
            pdf.setLineWidth(
              0.45,
            );
            sabahOutline.forEach(
              (
                point,
                index,
              ) => {
                const current =
                  project(
                    point.lng,
                    point.lat,
                  );
                const nextPoint =
                  sabahOutline[
                    (
                      index +
                      1
                    ) %
                      sabahOutline.length
                  ];
                const next =
                  project(
                    nextPoint.lng,
                    nextPoint.lat,
                  );

                pdf.line(
                  current.x,
                  current.y,
                  next.x,
                  next.y,
                );
              },
            );
            const fallbackMarker =
              project(
                centreLng,
                centreLat,
              );
            markerX =
              fallbackMarker.x;
            markerY =
              fallbackMarker.y;
          }

          pdf.setFillColor(
            220,
            38,
            38,
          );
          pdf.circle(
            markerX,
            markerY,
            2.2,
            "F",
          );
          pdf.setDrawColor(
            255,
            255,
            255,
          );
          pdf.circle(
            markerX,
            markerY,
            2.8,
          );
          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.setFontSize(
            5.5,
          );
          pdf.setTextColor(
            51,
            65,
            85,
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.rect(
            x +
              1,
            y +
              height -
              6,
            width -
              2,
            5,
            "F",
          );
          pdf.text(
            `${centreLat.toFixed(5)}, ${centreLng.toFixed(5)}`,
            x +
              3,
            y +
              height -
              2,
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            formData.district.trim() ||
              formData.village.trim() ||
              "General location",
            x +
              width -
              3,
            y +
              5,
            {
              align:
                "right",
              maxWidth:
                width *
                0.58,
            },
              );
        };

        const addFinalTitleBlock = (
          x: number,
          y: number,
          width: number,
          height: number,
        ) => {
          const sectionHeight =
            4;
          const smallFont =
            pdfPaperSize ===
            "a4"
              ? 5.2
              : 6;
          let cursorY =
            y;

          const drawSectionTitle = (
            title: string,
          ) => {
            pdf.setFillColor(
              241,
              245,
              249,
            );
            pdf.setDrawColor(
              15,
              23,
              42,
            );
            pdf.rect(
              x,
              cursorY,
              width,
              sectionHeight,
              "FD",
            );
            pdf.setFont(
              "helvetica",
              "bold",
            );
            pdf.setFontSize(
              6.6,
            );
            pdf.setTextColor(
              15,
              23,
              42,
            );
            pdf.text(
              title.toUpperCase(),
              x +
                2,
              cursorY +
                2.9,
            );
            cursorY +=
              sectionHeight;
          };

          const drawDetailRow = (
            label: string,
            value: string,
            rowHeight = 4.4,
          ) => {
            pdf.setDrawColor(
              148,
              163,
              184,
            );
            pdf.rect(
              x,
              cursorY,
              width,
              rowHeight,
            );
            pdf.setFont(
              "helvetica",
              "normal",
            );
            pdf.setFontSize(
              smallFont,
            );
            pdf.setTextColor(
              71,
              85,
              105,
            );
            pdf.text(
              label,
              x +
                2,
              cursorY +
                2.7,
              {
                maxWidth:
                  width *
                  0.34,
              },
            );
            pdf.setFont(
              "helvetica",
              "bold",
            );
            pdf.setTextColor(
              15,
              23,
              42,
            );
            const valueLines =
              pdf.splitTextToSize(
                value,
                width *
                  0.58,
              ).slice(
                0,
                rowHeight >= 8
                  ? 2
                  : 1,
              );
            pdf.text(
              valueLines,
              x +
                width *
                  0.39,
              cursorY +
                2.7,
              {
                maxWidth:
                  width *
                  0.58,
              },
            );
            cursorY +=
              rowHeight;
          };

          const drawSignatureCell = (
            cellX: number,
            cellY: number,
            cellWidth: number,
            cellHeight: number,
            title: string,
            fields: string[],
            idValue: string,
          ) => {
            pdf.setDrawColor(
              148,
              163,
              184,
            );
            pdf.rect(
              cellX,
              cellY,
              cellWidth,
              cellHeight,
            );
            pdf.setFont(
              "helvetica",
              "bold",
            );
            pdf.setFontSize(
              smallFont,
            );
            pdf.setTextColor(
              15,
              23,
              42,
            );
            pdf.text(
              title,
              cellX +
                1.5,
              cellY +
                2.8,
              {
                maxWidth:
                  cellWidth -
                  3,
              },
            );

            pdf.setFont(
              "helvetica",
              "normal",
            );
            pdf.setTextColor(
              71,
              85,
              105,
            );
            const fieldRows = [
              ...fields,
              `ID No.: ${idValue || ""}`,
            ];
            const fieldStartY =
              cellY +
              6.7;
            const fieldGap =
              Math.max(
                3.6,
                Math.min(
                  4.6,
                  (cellHeight -
                    13) /
                    Math.max(
                      fieldRows.length,
                      1,
                    ),
                ),
              );
            fieldRows.forEach(
              (
                field,
                index,
              ) => {
                const [
                  label,
                  ...valueParts
                ] =
                  field.split(
                    ":",
                  );
                const value =
                  valueParts
                    .join(
                      ":",
                    )
                    .trim();
                const fieldY =
                  fieldStartY +
                  index *
                    fieldGap;
                const lineStartX =
                  cellX +
                  Math.min(
                    cellWidth *
                      0.42,
                    18,
                  );
                pdf.text(
                  `${label}:`,
                  cellX +
                    1.5,
                  fieldY,
                  {
                    maxWidth:
                      lineStartX -
                      cellX -
                      2.2,
                  },
                );
                pdf.line(
                  lineStartX,
                  fieldY +
                    0.4,
                  cellX +
                    cellWidth -
                    1.8,
                  fieldY +
                    0.4,
                );
                if (value) {
                  pdf.text(
                    value,
                    lineStartX +
                      1,
                    fieldY -
                      0.4,
                    {
                      maxWidth:
                        cellX +
                        cellWidth -
                        lineStartX -
                        3,
                    },
                  );
                }
              },
            );

            const lineY =
              cellY +
              cellHeight -
              5;
            pdf.line(
              cellX +
                1.5,
              lineY,
              cellX +
                cellWidth -
                1.5,
              lineY,
            );
            pdf.text(
              "Signature / Date",
              cellX +
                1.5,
              lineY +
                3,
            );
          };

          pdf.setDrawColor(
            15,
            23,
            42,
          );
          pdf.setLineWidth(
            0.3,
          );
          pdf.rect(
            x,
            y,
            width,
            height,
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.rect(
            x,
            cursorY,
            width,
            14,
            "FD",
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.setFontSize(
            Math.min(
              10,
              width /
                7,
            ),
          );
          pdf.text(
            "SabahLot powered by Myukur",
            x +
              3,
            cursorY +
              5,
            {
              maxWidth:
                width -
                6,
            },
          );
          pdf.setFontSize(
            7,
          );
          pdf.text(
            planTemplateLabel,
            x +
              3,
            cursorY +
              9,
          );
          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.text(
            planCode,
            x +
              3,
            cursorY +
              12.5,
          );
          cursorY +=
            14;

          drawSectionTitle(
            "Project information",
          );
          drawDetailRow(
            "Job Title",
            jobTitle,
            8,
          );
          drawDetailRow(
            "Project / lot name",
            lotName,
          );
          drawDetailRow(
            "Village",
            formData.village.trim() ||
              "-",
          );
          drawDetailRow(
            "District",
            formData.district.trim() ||
              "-",
          );
          drawDetailRow(
            "Lot number",
            formData.lotNumber.trim() ||
              "-",
          );
          drawDetailRow(
            "Area / Perimeter",
            `${displayArea(
              polygon.areaM2,
              "en",
            )} / ${formatNumber(
              polygon.perimeterM,
              "en",
            )} m`,
          );

          drawSectionTitle(
            "Technical information",
          );
          drawDetailRow(
            "Coordinate system",
            coordinateSystem,
            4,
          );
          drawDetailRow(
            "Scale",
            "Diagrammatic",
            4,
          );
          drawDetailRow(
            "Paper / Orientation",
            `${pdfPaperSize.toUpperCase()} / ${
              pdfOrientation ===
              "portrait"
                ? "Portrait"
                : "Landscape"
            }`,
            4,
          );
          drawDetailRow(
            "Generated date",
            generatedAt.toLocaleString(
              "en-MY",
            ),
            4,
          );

          drawSectionTitle(
            "Coordinate / boundary table",
          );
          const coordinateRowHeight =
            3.8;
          const columns = [
            0,
            0.08,
            0.29,
            0.49,
            0.58,
            0.79,
          ].map(
            (ratio) =>
              x +
              width *
                ratio,
          );
          [
            "Pt",
            "Longitude",
            "Latitude",
            "Bearing",
            "Distance",
            "Z",
          ].forEach(
            (
              heading,
              index,
            ) => {
              pdf.setFont(
                "helvetica",
                "bold",
              );
          pdf.setFontSize(
                5.5,
              );
              pdf.text(
                heading,
                columns[index] +
                  0.6,
                cursorY +
                  2.6,
              );
            },
          );
          pdf.rect(
            x,
            cursorY,
            width,
            coordinateRowHeight,
          );
          cursorY +=
            coordinateRowHeight;

          polygon.coordinates
            .slice(
              0,
              5,
            )
            .forEach(
              (
                coordinate,
                index,
              ) => {
                const values = [
                  String(index + 1),
                  coordinate.lng.toFixed(5),
                  coordinate.lat.toFixed(5),
                  polygon.segments[index]
                    ?.bearingDms ?? "-",
                  polygon.segments[index]
                    ?.distanceM.toFixed(1) ?? "-",
                  "-",
                ];
                pdf.rect(
                  x,
                  cursorY,
                  width,
                  coordinateRowHeight,
                );
                pdf.setFont(
                  "helvetica",
                  "normal",
                );
                pdf.setFontSize(
                  5.4,
                );
                values.forEach(
                  (
                    value,
                    valueIndex,
                  ) => {
                    pdf.text(
                      value,
                      columns[valueIndex] +
                        0.6,
                      cursorY +
                        2.6,
                      {
                        maxWidth:
                          width *
                          0.19,
                      },
                    );
                  },
                );
                cursorY +=
                  coordinateRowHeight;
              },
            );

          if (
            polygon.coordinates.length >
            5
          ) {
            pdf.setFont(
              "helvetica",
              "italic",
            );
            pdf.setFontSize(
              5,
            );
            pdf.text(
              "Additional points continue in the coordinate table page.",
              x +
                2,
              cursorY +
                2.5,
              {
                maxWidth:
                  width -
                  4,
              },
            );
            cursorY +=
              3.5;
          }

          drawSectionTitle(
            "Verification / acknowledgement",
          );
          const signatureTop =
            cursorY;
          const signatureHeight =
            Math.min(
              62,
              Math.max(
                50,
                height -
                  (
                    cursorY -
                    y
                  ) -
                  21,
              ),
            );
          const cellWidth =
            width /
            2;
          const cellHeight =
            signatureHeight /
            2;
          drawSignatureCell(
            x,
            signatureTop,
            cellWidth,
            cellHeight,
            "Surveyor / Plotter",
            [
              "Name:",
              "Role:",
            ],
            visibleIdentity(
              pdfIdentities.surveyor,
            ),
          );
          drawSignatureCell(
            x +
              cellWidth,
            signatureTop,
            cellWidth,
            cellHeight,
            "Witness",
            [
              "Name:",
            ],
            visibleIdentity(
              pdfIdentities.witness,
            ),
          );
          drawSignatureCell(
            x,
            signatureTop +
              cellHeight,
            cellWidth,
            cellHeight,
            "Village Head / JPKK",
            [
              "Name:",
              "Position:",
              "Village / JPKK:",
            ],
            visibleIdentity(
              pdfIdentities.villageHead,
            ),
          );
          drawSignatureCell(
            x +
              cellWidth,
            signatureTop +
              cellHeight,
            cellWidth,
            cellHeight,
            "Applicant / Landowner",
            [
              `Name: ${formData.ownerName.trim()}`,
            ],
            visibleIdentity(
              pdfIdentities.applicant,
            ),
          );
          cursorY +=
            signatureHeight;

          const remainingHeight =
            Math.max(
              18,
              y +
                height -
                cursorY,
            );
          pdf.rect(
            x,
            cursorY,
            width,
            remainingHeight,
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            5.8,
          );
          pdf.setTextColor(
            185,
            28,
            28,
          );
          pdf.text(
            preliminaryNotice,
            x +
              2,
            cursorY +
              3.8,
            {
              maxWidth:
                width -
                4,
            },
          );
          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.setFontSize(
            4.8,
          );
          pdf.setTextColor(
            51,
            65,
            85,
          );
          pdf.text(
            pdf.splitTextToSize(
              preliminaryAcknowledgement,
              width -
                4,
            ),
            x +
              2,
            cursorY +
              7.5,
            {
              maxWidth:
                width -
                4,
            },
          );
          pdf.text(
            pdf.splitTextToSize(
              disclaimer,
              width -
                4,
            ),
            x +
              2,
            cursorY +
              16,
            {
              maxWidth:
                width -
                4,
            },
          );
        };

        addDrawingBorder();

        const mapY =
          margin;

        const contentWidth =
          pageWidth -
          margin *
            2;

        const sheetContentHeight =
          pageHeight -
          margin *
            2;

        const titleBlockWidth =
          contentWidth *
          0.31;

        const sheetGap =
          Math.max(
            2,
            Math.min(
              4,
              contentWidth *
                0.012,
            ),
          );

        const mainMapAreaWidth =
          contentWidth -
          titleBlockWidth -
          sheetGap;

        const maxMapHeight =
          sheetContentHeight;

        const mapWidth =
          mainMapAreaWidth;

        const mapHeight =
          maxMapHeight;

        const mapX =
          margin;

        const centredMapY =
          mapY;

        const targetAspectRatio =
          (
            mapWidth -
            0
          ) /
          (
            mapHeight -
            0
          );
        const sourceAspectRatio =
          mapCanvas.width /
          mapCanvas.height;
        const mapImageInset =
          1;
        const availableMapWidth =
          mapWidth -
          mapImageInset *
            2;
        const availableMapHeight =
          mapHeight -
          mapImageInset *
            2;
        let cropX =
          0;
        let cropY =
          0;
        let cropWidth =
          mapCanvas.width;
        let cropHeight =
          mapCanvas.height;

        if (
          sourceAspectRatio >
          targetAspectRatio
        ) {
          cropWidth =
            Math.round(
              mapCanvas.height *
                targetAspectRatio,
            );
          cropX =
            Math.round(
              (
                mapCanvas.width -
                cropWidth
              ) /
                2,
            );
        } else {
          cropHeight =
            Math.round(
              mapCanvas.width /
                targetAspectRatio,
            );
          cropY =
            Math.round(
              (
                mapCanvas.height -
                cropHeight
              ) /
                2,
            );
        }

        const croppedMapCanvas =
          document.createElement(
            "canvas",
          );
        croppedMapCanvas.width =
          cropWidth;
        croppedMapCanvas.height =
          cropHeight;
        croppedMapCanvas
          .getContext("2d")
          ?.drawImage(
            mapCanvas,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight,
          );

        const planMapImageData =
          croppedMapCanvas.toDataURL(
            "image/png",
          );
        const keyPlanImageData =
          keyPlanLooksBlank
            ? null
            : keyPlanCanvas.toDataURL(
                "image/png",
              );
        const overlayBounds = (() => {
          const mapRect =
            mapElement.getBoundingClientRect();
          const elements =
            mapElement.querySelectorAll<HTMLElement | SVGElement>(
              ".leaflet-overlay-pane path, .leaflet-overlay-pane circle, .leaflet-marker-pane .sl-station-icon, .leaflet-marker-pane .sl-survey-label-icon",
            );
          let left =
            Number.POSITIVE_INFINITY;
          let top =
            Number.POSITIVE_INFINITY;
          let right =
            Number.NEGATIVE_INFINITY;
          let bottom =
            Number.NEGATIVE_INFINITY;

          elements.forEach(
            (element) => {
              const rect =
                element.getBoundingClientRect();

              if (
                rect.width ===
                  0 &&
                rect.height ===
                  0
              ) {
                return;
              }

              left =
                Math.min(
                  left,
                  rect.left -
                    mapRect.left,
                );
              top =
                Math.min(
                  top,
                  rect.top -
                    mapRect.top,
                );
              right =
                Math.max(
                  right,
                  rect.right -
                    mapRect.left,
                );
              bottom =
                Math.max(
                  bottom,
                  rect.bottom -
                    mapRect.top,
                );
            },
          );

          if (
            !Number.isFinite(left) ||
            !Number.isFinite(top) ||
            !Number.isFinite(right) ||
            !Number.isFinite(bottom)
          ) {
            return null;
          }

          const scaleX =
            mapCanvas.width /
            Math.max(
              1,
              mapElementWidth,
            );
          const scaleY =
            mapCanvas.height /
            Math.max(
              1,
              mapElementHeight,
            );
          const toPdfX = (
            value: number,
          ) =>
            mapX +
            mapImageInset +
            ((value * scaleX - cropX) /
              cropWidth) *
              availableMapWidth;
          const toPdfY = (
            value: number,
          ) =>
            centredMapY +
            mapImageInset +
            ((value * scaleY - cropY) /
              cropHeight) *
              availableMapHeight;

          return {
            left:
              toPdfX(left),
            top:
              toPdfY(top),
            right:
              toPdfX(right),
            bottom:
              toPdfY(bottom),
          };
        })();

        pdf.setDrawColor(
          15,
          23,
          42,
        );
        pdf.setLineWidth(
          0.3,
        );
        pdf.rect(
          mapX,
          mapY,
          mainMapAreaWidth,
          sheetContentHeight,
        );

        pdf.addImage(
          planMapImageData,
          "PNG",
          mapX +
            mapImageInset,
          centredMapY +
            mapImageInset,
          availableMapWidth,
          availableMapHeight,
          undefined,
          "FAST",
        );

        pdf.setDrawColor(
          15,
          23,
          42,
        );
        pdf.setLineWidth(
          0.45,
        );
        pdf.rect(
          mapX,
          centredMapY,
          mapWidth,
          mapHeight,
        );
        pdf.setLineWidth(
          0.2,
        );

        addNorthArrow(
          mapX +
            mapWidth -
            12,
          centredMapY +
            9,
        );
        addScaleBar(
          mapX +
            7,
          centredMapY +
            mapHeight -
            18,
        );

        const keyPlanWidth =
          Math.min(
            78,
            mapWidth *
              0.28,
          );
        const keyPlanHeight =
          Math.min(
            54,
            mapHeight *
              0.34,
          );
        const keyPlanGap =
          7;
        const keyPlanCandidates = [
          {
            x:
              mapX +
              keyPlanGap,
            y:
              centredMapY +
              keyPlanGap,
          },
          {
            x:
              mapX +
              mapWidth -
              keyPlanWidth -
              keyPlanGap,
            y:
              centredMapY +
              keyPlanGap,
          },
          {
            x:
              mapX +
              keyPlanGap,
            y:
              centredMapY +
              mapHeight -
              keyPlanHeight -
              keyPlanGap,
          },
          {
            x:
              mapX +
              mapWidth -
              keyPlanWidth -
              keyPlanGap,
            y:
              centredMapY +
              mapHeight -
              keyPlanHeight -
              keyPlanGap,
          },
        ];
        const overlapArea = (
          candidate: {
            x: number;
            y: number;
          },
        ) => {
          if (!overlayBounds) {
            return 0;
          }

          const overlapWidth =
            Math.max(
              0,
              Math.min(
                candidate.x +
                  keyPlanWidth,
                overlayBounds.right,
              ) -
                Math.max(
                  candidate.x,
                  overlayBounds.left,
                ),
            );
          const overlapHeight =
            Math.max(
              0,
              Math.min(
                candidate.y +
                  keyPlanHeight,
                overlayBounds.bottom,
              ) -
                Math.max(
                  candidate.y,
                  overlayBounds.top,
                ),
            );

          return overlapWidth *
            overlapHeight;
        };
        const keyPlanPosition =
          keyPlanCandidates.reduce(
            (
              best,
              candidate,
            ) =>
              overlapArea(candidate) <
              overlapArea(best)
                ? candidate
                : best,
          );

        addKeyPlan(
          keyPlanPosition.x,
          keyPlanPosition.y,
          keyPlanWidth,
          keyPlanHeight,
          keyPlanImageData,
        );

        addFinalTitleBlock(
          margin +
            mainMapAreaWidth +
            sheetGap,
          mapY,
          titleBlockWidth,
          sheetContentHeight,
        );

        if (
          polygon.coordinates.length >
          10
        ) {
          pdf.addPage();
          addDrawingBorder();

        pdf.setFont(
          "helvetica",
          "bold",
        );

        pdf.setFontSize(
          11,
        );

        pdf.text(
          reportText.coordinates,
          margin,
          18,
        );

        const columns = [
          margin,
          margin +
            contentWidth *
              0.08,
          margin +
            contentWidth *
              0.28,
          margin +
            contentWidth *
              0.48,
          margin +
            contentWidth *
              0.58,
          margin +
            contentWidth *
              0.76,
        ];

        const rowHeight =
          7;

        let rowY =
          28;

        const drawTableHeader =
          () => {
            pdf.setFillColor(
              226,
              232,
              240,
            );

            pdf.rect(
              margin,
              rowY -
                5,
              pageWidth -
                margin *
                  2,
              rowHeight,
              "F",
            );

            pdf.setFont(
              "helvetica",
              "bold",
            );

            pdf.setFontSize(
              8,
            );

            pdf.setTextColor(
              15,
              23,
              42,
            );

            pdf.text(
              reportText.point,
              columns[0],
              rowY,
            );

            pdf.text(
              reportText.longitude,
              columns[1],
              rowY,
            );

            pdf.text(
              reportText.latitude,
              columns[2],
              rowY,
            );

            pdf.text(
              reportText.bearing,
              columns[3],
              rowY,
            );

            pdf.text(
              reportText.distance,
              columns[4],
              rowY,
            );

            pdf.text(
              reportText.z,
              columns[5],
              rowY,
            );

            rowY +=
              rowHeight;
          };

        drawTableHeader();

        polygon.coordinates
          .slice(
            10,
          )
          .forEach(
          (
            coordinate,
            index,
          ) => {
            const pointIndex =
              index +
              10;

            if (
              rowY >
              pageHeight -
                18
            ) {
              addFooter();
              pdf.addPage();
              addDrawingBorder();
              rowY =
                28;
              drawTableHeader();
            }

            pdf.setFont(
              "helvetica",
              "normal",
            );

            pdf.setFontSize(
              8,
            );

            pdf.setTextColor(
              51,
              65,
              85,
            );

            pdf.text(
              String(
                pointIndex +
                  1,
              ),
              columns[0],
              rowY,
            );

            pdf.text(
              coordinate.lng.toFixed(
                6,
              ),
              columns[1],
              rowY,
            );

            pdf.text(
              coordinate.lat.toFixed(
                6,
              ),
              columns[2],
              rowY,
            );

            pdf.text(
              polygon.segments[
                pointIndex
              ]?.bearingDms ??
                "-",
              columns[3],
              rowY,
            );

            pdf.text(
              polygon.segments[
                pointIndex
              ]?.distanceM.toFixed(
                2,
              ) ??
                "-",
              columns[4],
              rowY,
            );

            pdf.text(
              "-",
              columns[5],
              rowY,
            );

            rowY +=
              rowHeight;
          },
        );

        addFooter();
        }

        const fileName =
          lotName
            .replace(
              /[^a-z0-9]+/gi,
              "-",
            )
            .replace(
              /^-|-$/g,
              "",
            )
            .toLowerCase() ||
          "sabahlot-plan";

        pdf.save(
          `${fileName}.pdf`,
        );

        setSaveMessage(
          PAGE_TEXT.en.exportPdfSuccess,
        );
      } catch {
        setSaveMessage(
          PAGE_TEXT.en.exportPdfFailed,
        );
      } finally {
        window.dispatchEvent(
          new CustomEvent(
            "sabahlot:prepare-pdf-snapshot",
            {
              detail: {
                restore:
                  true,
              },
            },
          ),
        );
        setIsExportingPdf(false);
      }
    };

  const downloadTextFile = (
    content: string,
    fileName: string,
    type: string,
  ) => {
    const url =
      URL.createObjectURL(
        new Blob(
          [
            content,
          ],
          {
            type,
          },
        ),
      );

    const anchor =
      document.createElement(
        "a",
      );

    anchor.href =
      url;

    anchor.download =
      fileName;

    anchor.click();

    URL.revokeObjectURL(
      url,
    );
  };

  const exportKml =
    () => {
      if (!polygon) {
        setSaveMessage(
          text.polygonRequired,
        );

        return;
      }

      const lotName =
        formData.lotNumber.trim() ||
        "SabahLot";

      const safeLotName =
        lotName.replace(
          /[&<>"']/g,
          (
            character,
          ) => ({
            "&":
              "&amp;",
            "<":
              "&lt;",
            ">":
              "&gt;",
            '"':
              "&quot;",
            "'":
              "&apos;",
          })[
            character
          ] ??
          character,
        );

      const coordinates = [
        ...polygon.coordinates,
        polygon.coordinates[0],
      ]
        .map(
          (
            coordinate,
          ) =>
            `${coordinate.lng},${coordinate.lat},0`,
        )
        .join(" ");

      downloadTextFile(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
          `<name>${safeLotName}</name><Placemark><name>${safeLotName}</name>` +
          `<Polygon><outerBoundaryIs><LinearRing><coordinates>` +
          `${coordinates}</coordinates></LinearRing></outerBoundaryIs></Polygon>` +
          `</Placemark></Document></kml>`,
        `${lotName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.kml`,
        "application/vnd.google-earth.kml+xml",
      );

      setSaveMessage(
        text.exportOutputSuccess,
      );
    };

  const exportDxf =
    () => {
      if (!polygon) {
        setSaveMessage(
          text.polygonRequired,
        );

        return;
      }

      const vertices =
        polygon.coordinates
          .map(
            (
              coordinate,
            ) =>
              `10\n${coordinate.lng}\n20\n${coordinate.lat}\n`,
          )
          .join("");

      const lotName =
        formData.lotNumber.trim() ||
        "sabahlot";

      downloadTextFile(
        `0\nSECTION\n2\nENTITIES\n0\nLWPOLYLINE\n8\nSabahLot\n90\n` +
          `${polygon.coordinates.length}\n70\n1\n${vertices}` +
          `0\nENDSEC\n0\nEOF\n`,
        `${lotName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.dxf`,
        "application/dxf",
      );

      setSaveMessage(
        text.exportOutputSuccess,
      );
    };

  const exportSelectedOutput =
    () => {
      if (
        outputFormat ===
        "kml"
      ) {
        exportKml();
        return;
      }

      if (
        outputFormat ===
        "dxf"
      ) {
        exportDxf();
        return;
      }

      void exportPdfPlan();
    };

  return (
    <main className="sl-app-shell">
      <Map
        language={language}
        lotName={formData.lotNumber}
        initialCoordinates={
          loadedCoordinates
        }
        onPolygonChange={setPolygon}
        onSaveLot={
          saveLotRecord
        }
        onExportPdf={
          exportPdfPlan
        }
        isSavingLot={
          isSaving
        }
        isExportingPdf={
          isExportingPdf
        }
        onOpenLotPanel={openLotPanel}
        onLanguageChange={
          setLanguage
        }
        onAreaUnitChange={
          setSelectedAreaUnit
        }
      />

      <div
        className={
          `sl-drawer-backdrop ${
            lotPanelOpen
              ? "is-visible"
              : ""
          }`
        }
        onClick={
          closeLotPanel
        }
        aria-hidden="true"
      />

      <aside
        className={
          `sl-lot-drawer ${
            lotPanelOpen
              ? "is-open"
              : ""
          }`
        }
        aria-label={
          text.panelTitle
        }
        aria-hidden={
          !lotPanelOpen
        }
      >
        <div className="sl-drawer-header">
          <div className="sl-drawer-brand">
            <span className="sl-brand-mark">
              SL
            </span>

            <span>
              <strong>
                SabahLot
              </strong>

              <small>
                powered by Myukur
              </small>
            </span>
          </div>

          <button
            type="button"
            className="sl-drawer-close"
            onClick={
              closeLotPanel
            }
            aria-label={
              text.close
            }
          >
            ×
          </button>
        </div>

        <div className="sl-drawer-body">
          <div className="sl-drawer-title">
              <span className="sl-eyebrow">
                SabahLot powered by Myukur
            </span>

            <h1>
              {text.panelTitle}
            </h1>

            <p>
              {text.panelDescription}
            </p>
          </div>

          <form
            className="sl-lot-form"
            onSubmit={
              saveLotRecord
            }
          >
            <label>
              <span>
                {text.ownerName}
              </span>

              <input
                type="text"
                value={
                  formData.ownerName
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "ownerName",
                    event.target.value,
                  )
                }
                placeholder={
                  text.ownerPlaceholder
                }
                autoComplete="name"
              />
            </label>

            <label>
              <span>
                {text.lotNumber}
              </span>

              <input
                type="text"
                value={
                  formData.lotNumber
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "lotNumber",
                    event.target.value,
                  )
                }
                placeholder={
                  text.lotPlaceholder
                }
                autoComplete="off"
              />
            </label>

            <label>
              <span>
                {text.village}
              </span>

              <input
                type="text"
                value={
                  formData.village
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "village",
                    event.target.value,
                  )
                }
                placeholder={
                  text.villagePlaceholder
                }
                autoComplete="address-level3"
              />
            </label>

            <label>
              <span>
                {text.district}
              </span>

              <input
                type="text"
                value={
                  formData.district
                }
                onChange={(
                  event,
                ) =>
                  updateField(
                    "district",
                    event.target.value,
                  )
                }
                placeholder={
                  text.districtPlaceholder
                }
                autoComplete="address-level2"
              />
            </label>

            <button
              type="submit"
              className="sl-save-button"
              disabled={isSaving}
            >
              <span aria-hidden="true">
                ✓
              </span>

              <span>
                {isSaving
                  ? text.saving
                  : text.save}
              </span>
            </button>

            {saveMessage && (
              <p className="sl-save-message">
                {saveMessage}
              </p>
            )}
          </form>

          <section className="sl-drawing-summary">
            <div className="sl-summary-heading">
              <span className="sl-eyebrow">
                SabahLot powered by Myukur
              </span>

              <h2>
                {text.summary}
              </h2>
            </div>

            {polygon ? (
              <div className="sl-summary-grid">
                <div>
                  <span>
                    {text.points}
                  </span>

                  <strong>
                    {
                      polygon
                        .coordinates
                        .length
                    }
                  </strong>
                </div>

                <div>
                  <span>
                    {text.area}
                  </span>

                  <strong>
                    {displayArea(
                      polygon.areaM2,
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    {text.perimeter}
                  </span>

                  <strong>
                    {formatNumber(
                      polygon.perimeterM,
                      language,
                    )}{" "}
                    m
                  </strong>
                </div>
              </div>
            ) : (
              <p className="sl-empty-summary">
                {text.noPolygon}
              </p>
            )}

            <div className="sl-output-options">
              <span className="sl-output-options-title">
                Output options
              </span>

              <label>
                <span>
                  Output format
                </span>

                <select
                  value={
                    outputFormat
                  }
                  onChange={(
                    event,
                  ) =>
                    setOutputFormat(
                      event.target.value as
                        OutputFormat,
                    )
                  }
                >
                  <option value="pdf">
                    PDF
                  </option>

                  <option value="kml">
                    KML
                  </option>

                  <option value="dxf">
                    DXF
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Paper size
                </span>

                <select
                  value={pdfPaperSize}
                  onChange={(event) =>
                    setPdfPaperSize(
                      event.target
                        .value as PdfPaperSize,
                    )
                  }
                >
                  <option value="a4">A4</option>
                  <option value="a3">A3</option>
                  <option value="a2">A2</option>
                  <option value="a1">A1</option>
                  <option value="a0">A0</option>
                </select>
              </label>

              <label>
                <span>
                  Orientation
                </span>

                <select
                  value={pdfOrientation}
                  onChange={(event) =>
                    setPdfOrientation(
                      event.target
                        .value as PdfOrientation,
                    )
                  }
                >
                  <option value="portrait">
                    Portrait
                  </option>
                  <option value="landscape">
                    Landscape
                  </option>
                </select>
              </label>

              <label className="sl-output-option-wide">
                <span>
                  Plan template
                </span>

                <select
                  value={planTemplate}
                  onChange={(event) =>
                    setPlanTemplate(
                      event.target
                        .value as PlanTemplate,
                    )
                  }
                >
                  <option value="preliminary-lot-plan">
                  {planTemplateLabel}
                  </option>
                </select>
              </label>

              <label className="sl-output-option-wide">
                <span>
                  Job Title
                </span>

                <input
                  type="text"
                  value={pdfJobTitle}
                  onChange={(event) =>
                    setPdfJobTitle(
                      event.target.value,
                    )
                  }
                  placeholder="Example: Preliminary Lot Arrangement for Discussion"
                  autoComplete="off"
                />
              </label>

              <label className="sl-output-option-wide">
                <span>
                  ID display
                </span>

                <select
                  value={pdfIdentityMode}
                  onChange={(event) =>
                    setPdfIdentityMode(
                      event.target
                        .value as IdentityDisplayMode,
                    )
                  }
                >
                  <option value="full">
                    Full
                  </option>
                  <option value="masked">
                    Masked
                  </option>
                  <option value="hidden">
                    Hidden
                  </option>
                </select>
              </label>

              <label>
                <span>
                  Surveyor ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.surveyor
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "surveyor",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Witness ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.witness
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "witness",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  JPKK ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.villageHead
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "villageHead",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Applicant ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.applicant
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "applicant",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <div className="sl-output-preview">
                <span>Output summary</span>
                <strong>
                  {planTemplateLabel} ·{" "}
                  {pdfPaperSize.toUpperCase()} ·{" "}
                  {pdfOrientation ===
                  "portrait"
                    ? "Portrait"
                    : "Landscape"}
                </strong>
                <small>
                  Area:{" "}
                  {polygon
                    ? displayArea(
                        polygon.areaM2,
                        "en",
                      )
                    : "Not available"}
                </small>
              </div>
            </div>

            <button
              type="button"
              className="sl-save-button"
              onClick={
                exportSelectedOutput
              }
              disabled={
                !polygon ||
                isExportingPdf
              }
            >
              <span aria-hidden="true">
                {
                  outputFormat.toUpperCase()
                }
              </span>

              <span>
                {isExportingPdf
                  ? "Generating PDF..."
                  : "Generate output"}
              </span>
            </button>
          </section>

          <section className="sl-drawing-summary">
            <div className="sl-summary-heading">
              <span className="sl-eyebrow">
                SabahLot powered by Myukur
              </span>

              <h2>
                {text.savedLots}
              </h2>
            </div>

            <button
              type="button"
              className="sl-save-button"
              onClick={
                loadSavedLots
              }
              disabled={
                isLoadingLots
              }
            >
              {isLoadingLots
                ? text.loadingLots
                : text.loadLots}
            </button>

            {visibleCloudLots.length ===
              0 &&
            localLots.length ===
              0 ? (
              <p className="sl-empty-summary">
                {text.noSavedLots}
              </p>
            ) : (
              <div
                className="sl-saved-lots-list"
              >
                {localLots.map(
                  (lot) => (
                    <article
                      key={lot.id}
                      className="sl-saved-lot-card"
                    >
                      <div className="sl-saved-lot-heading">
                        <strong>
                          {lot.lot_name}
                        </strong>
                        <span className="sl-status-badge">
                          {lot.sync_status ===
                          "synced"
                            ? text.synced
                            : text.local}
                        </span>
                      </div>

                      <small>
                        {displayArea(
                          lot.area_m2,
                        )} · {lot.point_count}{" "}
                        {text.points}
                      </small>

                      <small className="sl-local-storage-status">
                        {text.storedOnDevice}
                      </small>

                      <div className="sl-saved-lot-actions">
                        <button
                          type="button"
                          onClick={() =>
                            loadLocalLot(lot)
                          }
                        >
                          {text.load}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            deleteLocalLotRecord(
                              lot.id,
                            )
                          }
                        >
                          {text.delete}
                        </button>
                      </div>
                    </article>
                  ),
                )}

                {visibleCloudLots.map(
                  (
                    lot,
                  ) => (
                    <article
                      key={
                        lot.id
                      }
                      className="sl-saved-lot-card"
                    >
                      <div className="sl-saved-lot-heading">
                        <strong>
                          {lot.lot_name}
                        </strong>
                        <span className="sl-status-badge">
                          {text.synced}
                        </span>
                      </div>

                      <small>
                        {displayArea(
                          lot.area_m2,
                        )}
                      </small>

                      <div
                        className="sl-saved-lot-actions"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            loadSavedLot(
                              lot,
                            )
                          }
                        >
                          {text.load}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void deleteSavedLot(
                              lot.id,
                            )
                          }
                        >
                          {text.delete}
                        </button>
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        </div>

        <div className="sl-drawer-footer">
          <button
            type="button"
            onClick={
              clearSavedRecord
            }
          >
            {text.clearRecord}
          </button>

          <small>
            SabahLot powered by Myukur
          </small>
        </div>
      </aside>
    </main>
  );
}
