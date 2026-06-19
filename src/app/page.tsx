 "use client";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import Map, {
  formatAreaDisplay,
  type ManualPointExport,
} from "./components/Map";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  deleteLocalLot,
  getLocalLots,
  LOCAL_LOT_SCHEMA_VERSION,
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

import type {
  DrawingObject,
} from "@/lib/drawing-types";

interface LotFormData {
  ownerName: string;
  lotNumber: string;
  village: string;
  district: string;
}

interface SavedLotRecord extends LotFormData {
  projectId?: string | null;
  polygon: PolygonResult | null;
  drawingObjects?: DrawingObject[];
  activeObjectId?: string | null;
  pdfIdentities?: PdfIdentityFields;
  schemaVersion?: number;
  savedAt: string;
}

interface PreviousSavedLotRecord {
  projectId?: string | null;
  ownerName?: string;
  lotName?: string;
  lotNumber?: string;
  village?: string;
  district?: string;
  polygon?: PolygonResult | null;
  drawingObjects?: DrawingObject[];
  activeObjectId?: string | null;
  pdfIdentities?: PreviousPdfIdentityFields;
  schemaVersion?: number;
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

interface PdfIdentityPerson {
  name: string;
  idNo: string;
}

interface PdfIdentityFields {
  surveyor: PdfIdentityPerson;
  witness: PdfIdentityPerson;
  villageHead: PdfIdentityPerson;
  applicant: PdfIdentityPerson;
}

type PreviousPdfIdentityFields =
  | Partial<
      Record<
        keyof PdfIdentityFields,
        string | Partial<PdfIdentityPerson>
      >
    >
  | null
  | undefined;

const STORAGE_KEY =
  "sabahlot-alpha-record";

const EMPTY_FORM: LotFormData = {
  ownerName: "",
  lotNumber: "",
  village: "",
  district: "",
};

const EMPTY_PDF_IDENTITIES: PdfIdentityFields = {
  surveyor: {
    name: "",
    idNo: "",
  },
  witness: {
    name: "",
    idNo: "",
  },
  villageHead: {
    name: "",
    idNo: "",
  },
  applicant: {
    name: "",
    idNo: "",
  },
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
      "Lot saved locally and synced to cloud.",

    cloudSyncFailed:
      "Lot saved locally. Cloud sync is currently unavailable.",

    savedLocalSignIn:
      "Project saved locally.",

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
      "Lot saved locally and synced to cloud.",

    cloudSyncFailed:
      "Lot saved locally. Cloud sync is currently unavailable.",

    savedLocalSignIn:
      "Project saved locally.",

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

function normalizePdfIdentities(
  value: PreviousPdfIdentityFields,
): PdfIdentityFields {
  const normalizePerson = (
    person:
      | string
      | Partial<PdfIdentityPerson>
      | undefined,
  ): PdfIdentityPerson => {
    if (typeof person === "string") {
      return {
        name: "",
        idNo: person,
      };
    }

    return {
      name:
        typeof person?.name === "string"
          ? person.name
          : "",
      idNo:
        typeof person?.idNo === "string"
          ? person.idNo
          : "",
    };
  };

  return {
    surveyor:
      normalizePerson(value?.surveyor),
    witness:
      normalizePerson(value?.witness),
    villageHead:
      normalizePerson(value?.villageHead),
    applicant:
      normalizePerson(value?.applicant),
  };
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
    drawingObjects,
    setDrawingObjects,
  ] = useState<DrawingObject[]>([]);

  const [
    manualPoints,
    setManualPoints,
  ] = useState<ManualPointExport[]>([]);

  const [
    activeObjectId,
    setActiveObjectId,
  ] = useState<string | null>(null);

  const [
    currentProjectId,
    setCurrentProjectId,
  ] = useState<string | null>(null);

  const [
    hasUnsavedChanges,
    setHasUnsavedChanges,
  ] = useState(false);

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

  const canSaveLot =
    Boolean(
      polygon &&
        polygon.coordinates.length >= 3,
    );

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

  const cloudSyncWarning = (
    error: unknown,
  ) => {
    const fallback = {
      code: null as string | null,
      message:
        "Unknown cloud sync error",
      details: null as string | null,
      hint: null as string | null,
    };

    if (
      error &&
      typeof error === "object"
    ) {
      const record =
        error as Record<
          string,
          unknown
        >;

      return {
        code:
          typeof record.code ===
          "string"
            ? record.code
            : typeof record.status ===
                "number"
              ? String(record.status)
              : fallback.code,
        message:
          typeof record.message ===
          "string"
            ? record.message
            : fallback.message,
        details:
          typeof record.details ===
          "string"
            ? record.details
            : fallback.details,
        hint:
          typeof record.hint ===
          "string"
            ? record.hint
            : fallback.hint,
      };
    }

    if (
      typeof error === "string" &&
      error.trim()
    ) {
      return {
        ...fallback,
        message: error,
      };
    }

    return fallback;
  };

  const withCloudTimeout = async <T,>(
    operation: PromiseLike<T>,
  ): Promise<T> =>
    Promise.race([
      Promise.resolve(operation),
      new Promise<never>(
        (_, reject) => {
          window.setTimeout(
            () =>
              reject(
                new Error(
                  "Cloud sync timed out.",
                ),
              ),
            12000,
          );
        },
      ),
    ]);

  const warnCloudSyncFailure = (
    error: unknown,
  ) => {
    console.warn(
      "SabahLot cloud sync unavailable:",
      cloudSyncWarning(error),
    );
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

      setCurrentProjectId(
        parsedRecord.projectId ??
          null,
      );

      setDrawingObjects(
        parsedRecord.drawingObjects ??
          [],
      );

      setActiveObjectId(
        parsedRecord.activeObjectId ??
          parsedRecord.drawingObjects?.[0]
            ?.id ??
          null,
      );

      setPdfIdentities(
        normalizePdfIdentities(
          parsedRecord.pdfIdentities,
        ),
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
      setHasUnsavedChanges(false);
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
        projectId:
          currentProjectId,
        ...formData,
        polygon,
        drawingObjects,
        activeObjectId,
        pdfIdentities,
        schemaVersion:
          LOCAL_LOT_SCHEMA_VERSION,
        savedAt: new Date().toISOString(),
      };

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(draft),
      );
    } catch {
      // Explicit Save reports storage failures to the user.
    }
  }, [
    activeObjectId,
    currentProjectId,
    formData,
    polygon,
    drawingObjects,
    pdfIdentities,
  ]);

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
    setHasUnsavedChanges(true);
    setFormData(
      (current) => ({
        ...current,
        [field]: value,
      }),
    );
  };

  const updatePdfIdentity = (
    field: keyof PdfIdentityFields,
    key: keyof PdfIdentityPerson,
    value: string,
  ) => {
    setPdfIdentities(
      (current) => ({
        ...current,
        [field]: {
          ...current[field],
          [key]: value,
        },
      }),
    );
    setHasUnsavedChanges(true);
  };

  const openLotPanel =
    () => {
      setLotPanelOpen(true);
    };

  const closeLotPanel =
    () => {
      setLotPanelOpen(false);
    };

  const handleDrawingObjectsChange = (
    objects: DrawingObject[],
    options?: {
      markUnsaved?: boolean;
    },
  ) => {
    setDrawingObjects(objects);

    if (
      options?.markUnsaved !== false
    ) {
      setHasUnsavedChanges(true);
    }
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
          !canSaveLot ||
          !polygon
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
            projectId:
              currentProjectId,
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
            drawingObjects,
            activeObjectId,
            pdfIdentities,
          });

          setCurrentProjectId(
            localRecord.id,
          );
          setLocalLots(getLocalLots());
          setHasUnsavedChanges(false);
        } catch {
          setSaveMessage(
            text.saveFailed,
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
            await withCloudTimeout(
              supabase.auth.getUser(),
            );

          const userId =
            user?.id ?? null;

          if (!userId) {
            if (userError) {
              warnCloudSyncFailure(
                userError,
              );
            }
            setSaveMessage(
              text.savedLocalSignIn,
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
            await withCloudTimeout(
              supabase
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
                }),
            );

          if (error) {
            warnCloudSyncFailure(
              error,
            );
            setSaveMessage(
              text.cloudSyncFailed,
            );
            return;
          }

          const record:
            SavedLotRecord = {
              projectId:
                localRecord.id,
              ...formData,
              polygon,
              drawingObjects,
              activeObjectId,
              pdfIdentities,
              schemaVersion:
                LOCAL_LOT_SCHEMA_VERSION,
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
          warnCloudSyncFailure(
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
      setCurrentProjectId(
        null,
      );
      setDrawingObjects([]);
      setActiveObjectId(null);
      setHasUnsavedChanges(false);

      setSaveMessage(text.loaded);
    };

  const loadLocalLot = (
    lot: LocalLotRecord,
  ) => {
    try {
      setCurrentProjectId(lot.id);
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
      setDrawingObjects(
        lot.drawing_objects ?? [],
      );
      setActiveObjectId(
        lot.active_object_id ??
          lot.drawing_objects?.[0]?.id ??
          null,
      );
      setPdfIdentities(
        normalizePdfIdentities(
          lot.pdf_identities,
        ),
      );
      setHasUnsavedChanges(false);
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

      setCurrentProjectId(
        null,
      );

      setActiveObjectId(
        null,
      );

      setDrawingObjects([]);
      setHasUnsavedChanges(false);

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

      const visiblePdfObjects =
        drawingObjects.filter(
          (object) =>
            object.isVisible &&
            object.coordinates.length >=
              (
                object.geometryType ===
                "polygon"
                  ? 3
                  : 2
              ),
        );

      if (
        visiblePdfObjects.length === 0
      ) {
        setSaveMessage(
          "No visible drawing objects to export.",
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
          0.1;
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
            baseOnly?: boolean;
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

        interface PdfOverlayPoint {
          x: number;
          y: number;
          lat: number;
          lng: number;
        }

        interface PdfOverlaySegment {
          start: PdfOverlayPoint;
          end: PdfOverlayPoint;
          midpoint: {
            x: number;
            y: number;
          };
          angle: number;
          distanceText: string;
          unitText: string;
          bearing: string;
        }

        interface PdfOverlayGeometry {
          width: number;
          height: number;
          vertices: PdfOverlayPoint[];
          segments: PdfOverlaySegment[];
        }

        const getPdfOverlayGeometry =
          () =>
            new Promise<PdfOverlayGeometry | null>(
              (resolve) => {
                window.dispatchEvent(
                  new CustomEvent(
                    "sabahlot:get-pdf-overlay-geometry",
                    {
                      detail: {
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
            0.1,
          paddingX:
            Math.max(
              24,
              snapshotPadding +
                cropPaddingX,
            ),
          paddingY:
            Math.max(
              24,
              snapshotPadding +
                cropPaddingY,
            ),
          baseOnly:
            true,
        });

        const mapOverlayGeometry =
          await getPdfOverlayGeometry();

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
        const datum =
          "WGS 84";

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
          "This preliminary plan is provided for reference, discussion and early planning purposes only. It is not an official survey plan, cadastral plan, Registered Survey Plan, SP Plan or legal proof of boundary. All measurements, coordinates and areas must be verified through a proper land survey and by the relevant authorities or qualified professionals.";

        const preliminaryAcknowledgement =
          "Pending Official Verification";

        const preliminaryNotice =
          "Pending Official Verification";

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

        const drawPanelTitle = (
          title: string,
          x: number,
          y: number,
          width: number,
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
            y,
            width,
            5,
            "FD",
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            6.8,
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
            y +
              3.5,
          );
        };

        const addPlanInfoPanel = (
          x: number,
          y: number,
          width: number,
          height: number,
        ) => {
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
          drawPanelTitle(
            "Plan Information",
            x,
            y,
            width,
          );

          const rows = [
            [
              "Negeri",
              "Sabah",
            ],
            [
              "Daerah",
              formData.district.trim() ||
                "-",
            ],
            [
              "Mukim/Bandar/Kampung",
              formData.village.trim() ||
                "-",
            ],
            [
              "No. lot/rujukan",
              formData.lotNumber.trim() ||
                lotName,
            ],
            [
              "Sistem koordinat",
              coordinateSystem,
            ],
            [
              "Datum",
              datum,
            ],
            [
              "Skala angka",
              "Diagrammatic",
            ],
          ];
          const rowHeight =
            9.2;
          let rowY =
            y +
            6;

          rows.forEach(
            ([label, value]) => {
              pdf.setDrawColor(
                203,
                213,
                225,
              );
              pdf.rect(
                x,
                rowY,
                width,
                rowHeight,
              );
              pdf.setFont(
                "helvetica",
                "normal",
              );
              pdf.setFontSize(
                5.6,
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
                rowY +
                  3,
                {
                  maxWidth:
                    width -
                    4,
                },
              );
              pdf.setFont(
                "helvetica",
                "bold",
              );
              pdf.setFontSize(
                6.2,
              );
              pdf.setTextColor(
                15,
                23,
                42,
              );
              pdf.text(
                pdf
                  .splitTextToSize(
                    value,
                    width -
                      4,
                  )
                  .slice(
                    0,
                    2,
                  ),
                x +
                  2,
                rowY +
                  6.4,
              );
              rowY +=
                rowHeight;
            },
          );

          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            6.2,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            "Skala grafik",
            x +
              2,
            rowY +
              3.5,
          );
          addScaleBar(
            x +
              5,
            rowY +
              9,
          );
        };

        const addStationSchedulePanel = (
          x: number,
          y: number,
          width: number,
          height: number,
        ) => {
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
          drawPanelTitle(
            "Station Schedule",
            x,
            y,
            width,
          );

          const tableTop =
            y +
            6;
          const rowHeight =
            5.5;
          const columns = [
            0,
            0.1,
            0.28,
            0.46,
            0.64,
            0.8,
          ].map(
            (ratio) =>
              x +
              width *
                ratio,
          );
          const headings = [
            "Stn",
            "Northing",
            "Easting",
            "Bearing",
            "Jarak",
            "Keluasan",
          ];

          pdf.setFillColor(
            226,
            232,
            240,
          );
          pdf.rect(
            x,
            tableTop,
            width,
            rowHeight,
            "F",
          );
          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            5,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          headings.forEach(
            (
              heading,
              index,
            ) => {
              pdf.text(
                heading,
                columns[index] +
                  0.7,
                tableTop +
                  3.6,
                {
                  maxWidth:
                    width *
                    0.18,
                },
              );
            },
          );

          let rowY =
            tableTop +
            rowHeight;
          const maxRows =
            Math.min(
              10,
              Math.max(
                1,
                Math.floor(
                  (
                    y +
                    height -
                    rowY -
                    8
                  ) /
                    rowHeight,
                ),
              ),
            );

          polygon.coordinates
            .slice(
              0,
              maxRows,
            )
            .forEach(
              (
                coordinate,
                index,
              ) => {
                const segment =
                  polygon.segments[index];
                const values = [
                  String(index + 1),
                  coordinate.lat.toFixed(6),
                  coordinate.lng.toFixed(6),
                  segment?.bearingDms ??
                    "-",
                  segment
                    ? segment.distanceM.toFixed(
                        2,
                      )
                    : "-",
                  index === 0
                    ? displayArea(
                        polygon.areaM2,
                        "en",
                      )
                    : "",
                ];

                pdf.setDrawColor(
                  203,
                  213,
                  225,
                );
                pdf.rect(
                  x,
                  rowY,
                  width,
                  rowHeight,
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
                values.forEach(
                  (
                    value,
                    valueIndex,
                  ) => {
                    pdf.text(
                      value,
                      columns[valueIndex] +
                        0.7,
                      rowY +
                        3.5,
                      {
                        maxWidth:
                          width *
                          0.18,
                      },
                    );
                  },
                );
                rowY +=
                  rowHeight;
              },
            );

          if (
            polygon.coordinates.length >
            maxRows
          ) {
            pdf.setFont(
              "helvetica",
              "italic",
            );
            pdf.setFontSize(
              5.2,
            );
            pdf.setTextColor(
              71,
              85,
              105,
            );
            pdf.text(
              "Additional stations continue on the coordinate table page.",
              x +
                2,
              y +
                height -
                3,
              {
                maxWidth:
                  width -
                  4,
              },
            );
          }
        };

        const addBottomTitleBlock = (
          x: number,
          y: number,
          width: number,
          height: number,
        ) => {
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

          const detailHeight =
            Math.max(
              17,
              Math.min(
                21,
                height *
                  0.42,
              ),
            );
          const disclaimerHeight =
            height -
            detailHeight;
          const columnWidth =
            width / 6;
          const rows = [
            [
              "Tajuk pelan",
              planTemplateLabel,
            ],
            [
              "Status",
              preliminaryNotice,
            ],
            [
              "Kod lukisan",
              planCode,
            ],
            [
              "Tarikh / Revisi",
              `${generatedAt.toLocaleDateString(
                "en-MY",
              )} / Rev 0`,
            ],
            [
              "Disediakan oleh",
              jobTitle === "-"
                ? "SabahLot Alpha"
                : jobTitle,
            ],
            [
              "Powered by",
              "SabahLot powered by Myukur",
            ],
          ];

          rows.forEach(
            (
              [label, value],
              index,
            ) => {
              const cellX =
                x +
                columnWidth *
                  index;
              pdf.setDrawColor(
                148,
                163,
                184,
              );
              pdf.rect(
                cellX,
                y,
                columnWidth,
                detailHeight,
              );
              pdf.setFont(
                "helvetica",
                "normal",
              );
              pdf.setFontSize(
                5.6,
              );
              pdf.setTextColor(
                71,
                85,
                105,
              );
              pdf.text(
                label,
                cellX +
                  2,
                y +
                  5,
                {
                  maxWidth:
                    columnWidth -
                    4,
                },
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
                pdf
                  .splitTextToSize(
                    value,
                    columnWidth -
                      4,
                  )
                  .slice(
                    0,
                    2,
                  ),
                cellX +
                  2,
                y +
                  11,
              );
            },
          );

          const disclaimerTop =
            y +
            detailHeight;
          pdf.setDrawColor(
            148,
            163,
            184,
          );
          pdf.rect(
            x,
            disclaimerTop,
            width,
            disclaimerHeight,
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
            "Disclaimer",
            x +
              2,
            disclaimerTop +
              4,
          );
          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.setFontSize(
            pdfPaperSize ===
            "a4"
              ? 5.2
              : 6,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          const disclaimerLines =
            pdf
              .splitTextToSize(
                disclaimer,
                width -
                  28,
              )
              .slice(
                0,
                Math.max(
                  2,
                  Math.floor(
                    (
                      disclaimerHeight -
                      5
                    ) /
                      3.4,
                  ),
                ),
              );
          pdf.text(
            disclaimerLines,
            x +
              24,
            disclaimerTop +
              4,
            {
              maxWidth:
                width -
                28,
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
            36;
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
              8,
            16,
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
              11,
          );
        };

        const addKeyPlan = (
          x: number,
          y: number,
          width: number,
          height: number,
          _snapshotData: string | null,
        ) => {
          const calculateSiteCentre =
            () => {
              let signedArea =
                0;
              let centroidLng =
                0;
              let centroidLat =
                0;

              polygon.coordinates.forEach(
                (
                  coordinate,
                  index,
                ) => {
                  const next =
                    polygon.coordinates[
                      (
                        index +
                        1
                      ) %
                        polygon.coordinates
                          .length
                    ];
                  const factor =
                    coordinate.lng *
                      next.lat -
                    next.lng *
                      coordinate.lat;

                  signedArea +=
                    factor;
                  centroidLng +=
                    (
                      coordinate.lng +
                      next.lng
                    ) *
                    factor;
                  centroidLat +=
                    (
                      coordinate.lat +
                      next.lat
                    ) *
                    factor;
                },
              );

              if (
                Math.abs(
                  signedArea,
                ) > 1e-10
              ) {
                const divisor =
                  3 *
                  signedArea;

                return {
                  lat:
                    centroidLat /
                    divisor,
                  lng:
                    centroidLng /
                    divisor,
                };
              }

              const average =
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

              return {
                lat:
                  average.lat /
                  polygon.coordinates
                    .length,
                lng:
                  average.lng /
                  polygon.coordinates
                    .length,
              };
            };
          const siteCentre =
            calculateSiteCentre();
          const centreLat =
            siteCentre.lat;
          const centreLng =
            siteCentre.lng;
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
          const footerTop =
            y +
            height -
            6;
          const sabahOutline: Coordinate[] = [
            { lat: 7.33, lng: 116.72 },
            { lat: 7.28, lng: 117.18 },
            { lat: 7.08, lng: 117.74 },
            { lat: 6.86, lng: 118.2 },
            { lat: 6.53, lng: 118.72 },
            { lat: 6.07, lng: 119.25 },
            { lat: 5.48, lng: 119.34 },
            { lat: 5.03, lng: 118.88 },
            { lat: 4.64, lng: 118.17 },
            { lat: 4.24, lng: 117.42 },
            { lat: 4.03, lng: 116.78 },
            { lat: 4.2, lng: 116.18 },
            { lat: 4.64, lng: 115.76 },
            { lat: 5.18, lng: 115.38 },
            { lat: 5.78, lng: 115.26 },
            { lat: 6.28, lng: 115.62 },
            { lat: 6.75, lng: 116.08 },
            { lat: 7.12, lng: 116.38 },
          ];
          const outlineBounds =
            sabahOutline.reduce(
              (
                bounds,
                point,
              ) => ({
                minLat:
                  Math.min(
                    bounds.minLat,
                    point.lat,
                  ),
                maxLat:
                  Math.max(
                    bounds.maxLat,
                    point.lat,
                  ),
                minLng:
                  Math.min(
                    bounds.minLng,
                    point.lng,
                  ),
                maxLng:
                  Math.max(
                    bounds.maxLng,
                    point.lng,
                  ),
              }),
              {
                minLat:
                  Number.POSITIVE_INFINITY,
                maxLat:
                  Number.NEGATIVE_INFINITY,
                minLng:
                  Number.POSITIVE_INFINITY,
                maxLng:
                  Number.NEGATIVE_INFINITY,
              },
            );
          const baseLatPadding =
            0.22;
          const baseLngPadding =
            0.24;
          let viewMinLat =
            Math.min(
              outlineBounds.minLat,
              centreLat,
            ) -
            baseLatPadding;
          let viewMaxLat =
            Math.max(
              outlineBounds.maxLat,
              centreLat,
            ) +
            baseLatPadding;
          let viewMinLng =
            Math.min(
              outlineBounds.minLng,
              centreLng,
            ) -
            baseLngPadding;
          let viewMaxLng =
            Math.max(
              outlineBounds.maxLng,
              centreLng,
            ) +
            baseLngPadding;
          const mapAspect =
            mapWidth /
            Math.max(
              1,
              mapHeight,
            );
          const boundsAspect =
            (
              viewMaxLng -
              viewMinLng
            ) /
            Math.max(
              0.0001,
              viewMaxLat -
                viewMinLat,
            );

          if (
            boundsAspect >
            mapAspect
          ) {
            const requiredLatSpan =
              (
                viewMaxLng -
                viewMinLng
              ) /
              mapAspect;
            const latCentre =
              (
                viewMinLat +
                viewMaxLat
              ) /
              2;

            viewMinLat =
              latCentre -
              requiredLatSpan / 2;
            viewMaxLat =
              latCentre +
              requiredLatSpan / 2;
          } else {
            const requiredLngSpan =
              (
                viewMaxLat -
                viewMinLat
              ) *
              mapAspect;
            const lngCentre =
              (
                viewMinLng +
                viewMaxLng
              ) /
              2;

            viewMinLng =
              lngCentre -
              requiredLngSpan / 2;
            viewMaxLng =
              lngCentre +
              requiredLngSpan / 2;
          }
          const project = (
            longitude: number,
            latitude: number,
          ) => ({
            x:
              mapLeft +
              ((longitude - viewMinLng) /
                (viewMaxLng - viewMinLng)) *
                mapWidth,
            y:
              mapTop +
              ((viewMaxLat - latitude) /
                (viewMaxLat - viewMinLat)) *
                mapHeight,
          });

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
          pdf.setFillColor(
            226,
            232,
            240,
          );
          pdf.rect(
            mapLeft,
            mapTop +
              mapHeight *
                0.66,
            mapWidth,
            mapHeight *
              0.34,
            "F",
          );
          pdf.setFillColor(
            187,
            247,
            208,
          );
          pdf.setDrawColor(
            22,
            101,
            52,
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

              if (
                index === 0
              ) {
                pdf.moveTo(
                  current.x,
                  current.y,
                );
              } else {
                pdf.lineTo(
                  current.x,
                  current.y,
                );
              }
            },
          );
          pdf.close();
          pdf.fillStroke();

          pdf.setDrawColor(
            134,
            239,
            172,
          );
          pdf.setLineWidth(
            0.18,
          );
          [
            [115.3, 6.7, 118.9, 6.05],
            [115.7, 5.25, 118.6, 4.75],
            [116.05, 4.28, 117.25, 7.05],
          ].forEach(
            (line) => {
              const start =
                project(
                  line[0],
                  line[1],
                );
              const end =
                project(
                  line[2],
                  line[3],
                );

              pdf.line(
                start.x,
                start.y,
                end.x,
                end.y,
              );
            },
          );

          const siteMarker =
            project(
              centreLng,
              centreLat,
            );
          const markerX =
            Math.max(
              mapLeft + 2.5,
              Math.min(
                mapLeft +
                  mapWidth -
                  2.5,
                siteMarker.x,
              ),
            );
          const markerY =
            Math.max(
              mapTop + 2.5,
              Math.min(
                mapTop +
                  mapHeight -
                  2.5,
                siteMarker.y,
              ),
            );

          pdf.setDrawColor(
            255,
            255,
            255,
          );
          pdf.setFillColor(
            220,
            38,
            38,
          );
          pdf.circle(
            markerX,
            markerY,
            2.8,
            "FD",
          );
          pdf.setFillColor(
            220,
            38,
            38,
          );
          pdf.circle(
            markerX,
            markerY,
            1.35,
            "F",
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.circle(
            markerX,
            markerY,
            0.45,
            "F",
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
            "SITE",
            Math.min(
              markerX + 4,
              mapLeft +
                mapWidth -
                2,
            ),
            Math.max(
              markerY - 2,
              mapTop + 4,
            ),
            {
              maxWidth:
                mapWidth *
                0.34,
            },
          );
          const districtLabel =
            formData.district.trim();

          if (districtLabel) {
            pdf.setFont(
              "helvetica",
              "normal",
            );
            pdf.setFontSize(
              5,
            );
            pdf.setTextColor(
              51,
              65,
              85,
            );
            pdf.text(
              districtLabel,
              Math.min(
                markerX + 4,
                mapLeft +
                  mapWidth -
                  2,
              ),
              Math.max(
                markerY + 2.2,
                mapTop + 7,
              ),
              {
                maxWidth:
                  mapWidth *
                  0.44,
              },
            );
          }
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
            footerTop,
            width -
              2,
            5,
            "F",
          );
          pdf.text(
            `Site centre: ${centreLat.toFixed(5)}, ${centreLng.toFixed(5)}`,
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
              "Sabah overview",
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
            4.4;
          const smallFont =
            pdfPaperSize ===
            "a4"
              ? 5.6
              : 6.2;
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
                2.4,
              cursorY +
                rowHeight /
                2 +
                0.6,
              {
                maxWidth:
                  width *
                  0.33,
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
                  0.55,
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
                  0.42,
              cursorY +
                rowHeight /
                2 +
                0.6,
              {
                maxWidth:
                  width *
                  0.55,
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
            nameValue: string,
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
                cellWidth /
                2,
              cellY +
                2.8,
              {
                align:
                  "center",
                maxWidth:
                cellWidth -
                3,
              },
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
            const trimmedName =
              nameValue.trim();
            const nameY =
              cellY +
              cellHeight -
              12.2;

            if (trimmedName) {
              pdf.text(
                trimmedName,
                cellX +
                  cellWidth /
                  2,
                nameY,
                {
                  align:
                    "center",
                  maxWidth:
                    cellWidth -
                    6,
                },
              );
            }

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
            const trimmedId =
              idValue.trim();

            pdf.text(
              trimmedId
                ? `IC / ID No.: ${trimmedId}`
                : "IC / ID No.:",
              cellX +
                cellWidth /
                2,
              nameY +
                3.6,
              {
                align:
                  "center",
                maxWidth:
                  cellWidth -
                  6,
              },
            );

            const signatureLineY =
              cellY +
              cellHeight -
              5.7;
            pdf.setDrawColor(
              100,
              116,
              139,
            );
            pdf.setLineDashPattern(
              [
                0.8,
                1.2,
              ],
              0,
            );
            pdf.line(
              cellX +
                4,
              signatureLineY,
              cellX +
                cellWidth -
                4,
              signatureLineY,
            );
            pdf.setLineDashPattern(
              [],
              0,
            );

            const lineY =
              cellY +
              cellHeight -
              2.7;
            pdf.text(
              "Signature / Date",
              cellX +
                cellWidth /
                2,
              lineY +
                2.8,
              {
                align:
                  "center",
                maxWidth:
                  cellWidth -
                  3,
              },
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
            4.6;
          const columnEdges = [
            0,
            0.08,
            0.28,
            0.47,
            0.68,
            0.88,
            1,
          ].map(
            (ratio) =>
              x +
              width *
                ratio,
          );
          const columnLabels = [
            "Pt",
            "Longitude",
            "Latitude",
            "Bearing",
            "Distance",
            "Z",
          ];
          const drawCoordinateCell = (
            cellIndex: number,
            rowY: number,
            value: string,
            bold = false,
          ) => {
            const cellX =
              columnEdges[cellIndex];
            const cellWidth =
              columnEdges[
                cellIndex + 1
              ] -
              cellX;
            pdf.setDrawColor(
              100,
              116,
              139,
            );
            pdf.rect(
              cellX,
              rowY,
              cellWidth,
              coordinateRowHeight,
            );
            pdf.setFont(
              "helvetica",
              bold
                ? "bold"
                : "normal",
            );
            pdf.setFontSize(
              bold
                ? 5.2
                : 5,
            );
            pdf.setTextColor(
              15,
              23,
              42,
            );
            pdf.text(
              pdf
                .splitTextToSize(
                  value,
                  cellWidth -
                    1.4,
                )
                .slice(
                  0,
                  1,
                ),
              cellX +
                cellWidth /
                2,
              rowY +
                coordinateRowHeight /
                2 +
                0.65,
              {
                align:
                  "center",
                maxWidth:
                  cellWidth -
                  1.8,
              },
            );
          };

          pdf.setFillColor(
            226,
            232,
            240,
          );
          pdf.rect(
            x,
            cursorY,
            width,
            coordinateRowHeight,
            "F",
          );
          columnLabels.forEach(
            (
              heading,
              index,
            ) => {
              drawCoordinateCell(
                index,
                cursorY,
                heading,
                true,
              );
            },
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
                    ?.distanceM.toFixed(2) ?? "-",
                  "-",
                ];
                values.forEach(
                  (
                    value,
                    valueIndex,
                  ) => {
                    drawCoordinateCell(
                      valueIndex,
                      cursorY,
                      value,
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
              48,
              Math.max(
                42,
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
            pdfIdentities.surveyor.name,
            visibleIdentity(
              pdfIdentities.surveyor.idNo,
            ),
          );
          drawSignatureCell(
            x +
              cellWidth,
            signatureTop,
            cellWidth,
            cellHeight,
            "Witness",
            pdfIdentities.witness.name,
            visibleIdentity(
              pdfIdentities.witness.idNo,
            ),
          );
          drawSignatureCell(
            x,
            signatureTop +
              cellHeight,
            cellWidth,
            cellHeight,
            "Village Head / JPKK",
            pdfIdentities.villageHead.name,
            visibleIdentity(
              pdfIdentities.villageHead.idNo,
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
            pdfIdentities.applicant.name.trim() ||
              formData.ownerName.trim(),
            visibleIdentity(
              pdfIdentities.applicant.idNo,
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

        const sheetGap =
          Math.max(
            2,
            Math.min(
              4,
              contentWidth *
                0.012,
              ),
          );

        const titleBlockWidth =
          contentWidth *
          0.31;

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
        const croppedMapContext =
          croppedMapCanvas.getContext(
            "2d",
          );
        croppedMapContext?.drawImage(
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

        if (
          croppedMapContext &&
          mapOverlayGeometry &&
          mapOverlayGeometry.vertices
            .length >= 3
        ) {
          const scaleX =
            mapCanvas.width /
            Math.max(
              1,
              mapOverlayGeometry.width,
            );
          const scaleY =
            mapCanvas.height /
            Math.max(
              1,
              mapOverlayGeometry.height,
            );
          const overlayScale =
            (
              scaleX +
              scaleY
            ) /
            2;
          const toCanvasPoint = (
            point: {
              x: number;
              y: number;
            },
          ) => ({
            x:
              point.x *
                scaleX -
              cropX,
            y:
              point.y *
                scaleY -
              cropY,
          });
          const drawLabelLine = (
            textValue: string,
            yOffset: number,
            fontSize: number,
          ) => {
            croppedMapContext.lineWidth =
              Math.max(
                2,
                2.5 *
                  overlayScale,
              );
            croppedMapContext.strokeStyle =
              "rgba(15, 23, 42, 0.92)";
            croppedMapContext.strokeText(
              textValue,
              0,
              yOffset +
                fontSize *
                  0.34,
            );
            croppedMapContext.fillStyle =
              "#ffffff";
            croppedMapContext.fillText(
              textValue,
              0,
              yOffset +
                fontSize *
                  0.34,
            );
          };

          croppedMapContext.save();
          croppedMapContext.beginPath();
          croppedMapContext.rect(
            0,
            0,
            cropWidth,
            cropHeight,
          );
          croppedMapContext.clip();

          const vertices =
            mapOverlayGeometry.vertices.map(
              toCanvasPoint,
            );

          croppedMapContext.beginPath();
          vertices.forEach(
            (
              point,
              index,
            ) => {
              if (
                index === 0
              ) {
                croppedMapContext.moveTo(
                  point.x,
                  point.y,
                );
              } else {
                croppedMapContext.lineTo(
                  point.x,
                  point.y,
                );
              }
            },
          );
          croppedMapContext.closePath();
          croppedMapContext.fillStyle =
            "rgba(56, 189, 248, 0.14)";
          croppedMapContext.fill();

          croppedMapContext.strokeStyle =
            "#000000";
          croppedMapContext.lineWidth =
            3 *
            overlayScale;
          croppedMapContext.lineCap =
            "butt";
          croppedMapContext.lineJoin =
            "bevel";

          mapOverlayGeometry.segments.forEach(
            (segment) => {
              const start =
                toCanvasPoint(
                  segment.start,
                );
              const end =
                toCanvasPoint(
                  segment.end,
                );

              croppedMapContext.beginPath();
              croppedMapContext.moveTo(
                start.x,
                start.y,
              );
              croppedMapContext.lineTo(
                end.x,
                end.y,
              );
              croppedMapContext.stroke();
            },
          );

          vertices.forEach(
            (
              point,
              index,
            ) => {
              const markerRadius =
                11 *
                overlayScale;

              croppedMapContext.beginPath();
              croppedMapContext.arc(
                point.x,
                point.y,
                5 *
                  overlayScale,
                0,
                Math.PI * 2,
              );
              croppedMapContext.fillStyle =
                "#ffffff";
              croppedMapContext.fill();
              croppedMapContext.lineWidth =
                2 *
                overlayScale;
              croppedMapContext.strokeStyle =
                "#000000";
              croppedMapContext.stroke();

              croppedMapContext.beginPath();
              croppedMapContext.arc(
                point.x,
                point.y,
                markerRadius *
                  0.72,
                0,
                Math.PI * 2,
              );
              croppedMapContext.fillStyle =
                "#ffffff";
              croppedMapContext.fill();
              croppedMapContext.lineWidth =
                1.8 *
                overlayScale;
              croppedMapContext.strokeStyle =
                "#000000";
              croppedMapContext.stroke();
              croppedMapContext.fillStyle =
                "#000000";
              croppedMapContext.font =
                `${Math.max(
                  9,
                  9 *
                    overlayScale,
                )}px Arial, sans-serif`;
              croppedMapContext.textAlign =
                "center";
              croppedMapContext.textBaseline =
                "middle";
              croppedMapContext.fillText(
                String(
                  index + 1,
                ),
                point.x,
                point.y,
              );
            },
          );

          mapOverlayGeometry.segments.forEach(
            (segment) => {
              const midpoint =
                toCanvasPoint(
                  segment.midpoint,
                );
              const fontSize =
                Math.max(
                  10,
                  10 *
                    overlayScale,
                );
              const lineGap =
                fontSize *
                1.4;

              croppedMapContext.save();
              croppedMapContext.translate(
                midpoint.x,
                midpoint.y,
              );
              croppedMapContext.rotate(
                (
                  segment.angle *
                  Math.PI
                ) /
                  180,
              );
              croppedMapContext.font =
                `800 ${fontSize}px Arial, sans-serif`;
              croppedMapContext.textAlign =
                "center";
              croppedMapContext.textBaseline =
                "middle";
              drawLabelLine(
                segment.bearing,
                -lineGap / 2,
                fontSize,
              );
              drawLabelLine(
                `${segment.distanceText} ${segment.unitText}`,
                lineGap / 2,
                fontSize,
              );
              croppedMapContext.restore();
            },
          );

          croppedMapContext.restore();
        }

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
          mapWidth,
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
            62,
            mapWidth *
              0.24,
          );
        const keyPlanHeight =
          Math.min(
            42,
            mapHeight *
              0.28,
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
          keyPlanCandidates[0];

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

        const columnEdges = [
          0,
          0.08,
          0.27,
          0.46,
          0.66,
          0.86,
          1,
        ].map(
          (ratio) =>
            margin +
            contentWidth *
              ratio,
        );

        const rowHeight =
          7;

        let rowY =
          28;

        const drawContinuationCell = (
          cellIndex: number,
          cellY: number,
          value: string,
          bold = false,
        ) => {
          const cellX =
            columnEdges[cellIndex];
          const cellWidth =
            columnEdges[
              cellIndex + 1
            ] - cellX;

          pdf.setDrawColor(
            100,
            116,
            139,
          );
          pdf.setLineWidth(
            0.2,
          );
          pdf.rect(
            cellX,
            cellY,
            cellWidth,
            rowHeight,
          );
          pdf.setFont(
            "helvetica",
            bold
              ? "bold"
              : "normal",
          );
          pdf.setFontSize(
            bold
              ? 7.2
              : 7,
          );
          pdf.setTextColor(
            15,
            23,
            42,
          );
          pdf.text(
            pdf
              .splitTextToSize(
                value,
                cellWidth -
                  2.4,
              )
              .slice(
                0,
                1,
              ),
            cellX +
              cellWidth /
              2,
            cellY +
              rowHeight /
              2 +
              0.9,
            {
              align:
                "center",
              maxWidth:
                cellWidth -
                3,
            },
          );
        };

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

            [
              reportText.point,
              reportText.longitude,
              reportText.latitude,
              reportText.bearing,
              reportText.distance,
              reportText.z,
            ].forEach(
              (
                heading,
                headingIndex,
              ) => {
                drawContinuationCell(
                  headingIndex,
                  rowY - 5,
                  heading,
                  true,
                );
              },
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

            [
              String(
                pointIndex +
                  1,
              ),
              coordinate.lng.toFixed(
                6,
              ),
              coordinate.lat.toFixed(
                6,
              ),
              polygon.segments[
                pointIndex
              ]?.bearingDms ??
                "-",
              polygon.segments[
                pointIndex
              ]?.distanceM.toFixed(
                2,
              ) ??
                "-",
              "-",
            ].forEach(
              (
                value,
                valueIndex,
              ) => {
                drawContinuationCell(
                  valueIndex,
                  rowY - 5,
                  value,
                );
              },
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

      const escapeKml =
        (value: string) =>
          value.replace(
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

      const categoryLabel =
        (value: string) =>
          value
            .split("_")
            .map(
              (part) =>
                part.charAt(0).toUpperCase() +
                part.slice(1),
            )
            .join(" ");

      const coordinateText =
        (
          coordinates: Array<{
            lat: number;
            lng: number;
          }>,
        ) =>
          coordinates
            .map(
              (
                coordinate,
              ) =>
                `${coordinate.lng},${coordinate.lat},0`,
            )
            .join(" ");

      const closedCoordinates =
        (
          coordinates: Array<{
            lat: number;
            lng: number;
          }>,
        ) => {
          const first =
            coordinates[0];
          const last =
            coordinates[
              coordinates.length - 1
            ];

          if (
            first &&
            last &&
            first.lat === last.lat &&
            first.lng === last.lng
          ) {
            return coordinates;
          }

          return first
            ? [
                ...coordinates,
                first,
              ]
            : coordinates;
        };

      const description = (
        rows: Array<[string, string]>,
      ) =>
        `<description><![CDATA[${rows
          .map(
            ([label, value]) =>
              `<strong>${escapeKml(label)}</strong>: ${escapeKml(value)}`,
          )
          .join("<br/>")}]]></description>`;

      const visibleObjects =
        drawingObjects.filter(
          (object) =>
            object.isVisible,
        );

      const placemarks =
        [
          ...manualPoints.map(
            (point) =>
              `<Placemark>` +
              `<name>${escapeKml(
                point.pointName.trim() ||
                  point.pointCode,
              )}</name>` +
              `<styleUrl>#sabahlot-point-style</styleUrl>` +
              description([
                [
                  "ID",
                  point.id,
                ],
                [
                  "Category",
                  categoryLabel(
                    point.category,
                  ),
                ],
                [
                  "Status",
                  "Preliminary",
                ],
              ]) +
              `<Point><coordinates>${coordinateText([
                point.coordinate,
              ])}</coordinates></Point>` +
              `</Placemark>`,
          ),
          ...visibleObjects.flatMap(
            (object) => {
              if (
                object.geometryType ===
                "polygon"
              ) {
                const coordinates =
                  coordinateText(
                    closedCoordinates(
                      object.coordinates,
                    ),
                  );

                return [
                  `<Placemark>` +
                    `<name>${escapeKml(
                      object.name,
                    )}</name>` +
                    `<styleUrl>#sabahlot-boundary-style</styleUrl>` +
                    description([
                      [
                        "ID",
                        object.id,
                      ],
                      [
                        "Category",
                        categoryLabel(
                          object.category,
                        ),
                      ],
                      [
                        "Status",
                        "Preliminary",
                      ],
                    ]) +
                    `<MultiGeometry>` +
                    `<Polygon><extrude>0</extrude><tessellate>1</tessellate>` +
                    `<outerBoundaryIs><LinearRing><coordinates>` +
                    `${coordinates}</coordinates></LinearRing></outerBoundaryIs>` +
                    `</Polygon>` +
                    `<LineString><tessellate>1</tessellate><coordinates>` +
                    `${coordinates}</coordinates></LineString>` +
                    `</MultiGeometry>` +
                    `</Placemark>`,
                ];
              }

              const lineKind =
                object.lineStyle ===
                "dashed"
                  ? "Dashed Line"
                  : "Solid Line";

              return [
                `<Placemark>` +
                  `<name>${escapeKml(
                    object.name,
                  )}</name>` +
                  `<styleUrl>#sabahlot-line-style</styleUrl>` +
                  description([
                    [
                      "ID",
                      object.id,
                    ],
                    [
                      "Category",
                      categoryLabel(
                        object.category,
                      ),
                    ],
                    [
                      "Line Type",
                      lineKind,
                    ],
                    [
                      "Status",
                      "Preliminary",
                    ],
                  ]) +
                  `<LineString><tessellate>1</tessellate><coordinates>` +
                  `${coordinateText(
                    object.coordinates,
                  )}</coordinates></LineString>` +
                  `</Placemark>`,
              ];
            },
          ),
        ];

      if (
        placemarks.length === 0
      ) {
        setSaveMessage(
          "No visible objects to export.",
        );

        return;
      }

      downloadTextFile(
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<kml xmlns="http://www.opengis.net/kml/2.2"><Document>` +
          `<name>${safeLotName}</name>` +
          `<Style id="sabahlot-boundary-style">` +
          `<LineStyle><color>ff00ffff</color><width>3</width></LineStyle>` +
          `<PolyStyle><color>0000ffff</color><fill>0</fill><outline>1</outline></PolyStyle>` +
          `</Style>` +
          `<Style id="sabahlot-line-style">` +
          `<LineStyle><color>ff00ffff</color><width>3</width></LineStyle>` +
          `</Style>` +
          `<Style id="sabahlot-point-style">` +
          `<IconStyle><scale>1</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>` +
          `</Style>` +
          `${placemarks.join("")}</Document></kml>`,
        `${lotName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.kml`,
        "application/vnd.google-earth.kml+xml",
      );

      setSaveMessage(
        text.exportOutputSuccess,
      );
    };

  const exportDxf =
    () => {
      const visibleObjects =
        drawingObjects.filter(
          (object) =>
            object.isVisible,
        );

      if (
        visibleObjects.length === 0 &&
        manualPoints.length === 0
      ) {
        setSaveMessage(
          "No visible objects to export.",
        );

        return;
      }

      const lotName =
        formData.lotNumber.trim() ||
        "sabahlot";
      const safeFileName =
        lotName
          .replace(
            /[^a-z0-9]+/gi,
            "-",
          )
          .toLowerCase();
      const sanitizeDxfText =
        (value: string) =>
          value
            .replace(
              /[\r\n]+/g,
              " ",
            )
            .trim();
      const layerNameForObject =
        (object: DrawingObject) => {
          if (
            object.geometryType ===
            "polygon"
          ) {
            return "LOT_BOUNDARY";
          }

          if (
            object.lineStyle ===
            "dashed"
          ) {
            return object.category ===
              "proposed_boundary" ||
              object.category ===
                "proposed_access" ||
              object.category ===
                "road_reserve" ||
              object.category ===
                "setback" ||
              object.category ===
                "reference_line"
              ? object.category.toUpperCase()
              : "DASHED_LINE";
          }

          return "LINE";
        };
      const closeCoordinates =
        (
          coordinates: Coordinate[],
        ) => {
          const first =
            coordinates[0];
          const last =
            coordinates[
              coordinates.length - 1
            ];

          if (
            first &&
            last &&
            first.lat === last.lat &&
            first.lng === last.lng
          ) {
            return coordinates;
          }

          return first
            ? [
                ...coordinates,
                first,
              ]
            : coordinates;
        };
      const pointText =
        (
          coordinate: Coordinate,
        ) =>
          `10\n${coordinate.lng}\n20\n${coordinate.lat}\n30\n0\n`;
      const lwPolylineEntity =
        (
          layer: string,
          coordinates: Coordinate[],
          closed: boolean,
        ) =>
          `0\nLWPOLYLINE\n8\n${layer}\n90\n${coordinates.length}\n70\n${
            closed
              ? 1
              : 0
          }\n` +
          coordinates
            .map(
              (coordinate) =>
                `10\n${coordinate.lng}\n20\n${coordinate.lat}\n`,
            )
            .join("");
      const pointEntity =
        (
          coordinate: Coordinate,
          label: string,
        ) =>
          `0\nPOINT\n8\nPOINT\n${pointText(
            coordinate,
          )}` +
          (
            label
              ? `0\nTEXT\n8\nTEXT_LABEL\n10\n${coordinate.lng}\n20\n${coordinate.lat}\n30\n0\n40\n0.00002\n1\n${sanitizeDxfText(
                  label,
                )}\n`
              : ""
          );
      const dxfLayers = [
        "LOT_BOUNDARY",
        "LINE",
        "DASHED_LINE",
        "PROPOSED_BOUNDARY",
        "PROPOSED_ACCESS",
        "ROAD_RESERVE",
        "SETBACK",
        "REFERENCE_LINE",
        "POINT",
        "TEXT_LABEL",
      ];
      const layerTable =
        `0\nTABLE\n2\nLAYER\n70\n${dxfLayers.length}\n` +
        dxfLayers
          .map(
            (
              layer,
              index,
            ) =>
              `0\nLAYER\n2\n${layer}\n70\n0\n62\n${
                index === 0
                  ? 1
                  : index === 1
                    ? 3
                    : index ===
                        dxfLayers.length - 1
                      ? 7
                      : 1
              }\n6\nCONTINUOUS\n`,
          )
          .join("") +
        `0\nENDTAB\n`;
      const objectEntities =
        visibleObjects
          .map((object) => {
            if (
              object.geometryType ===
              "polygon"
            ) {
              return (
                `999\n${sanitizeDxfText(
                  object.name,
                )}\n` +
                lwPolylineEntity(
                  "LOT_BOUNDARY",
                  closeCoordinates(
                    object.coordinates,
                  ),
                  true,
                )
              );
            }

            return (
              `999\n${sanitizeDxfText(
                `${object.name} (${object.lineStyle})`,
              )}\n` +
              lwPolylineEntity(
                layerNameForObject(
                  object,
                ),
                object.coordinates,
                false,
              )
            );
          })
          .join("");
      const pointEntities =
        manualPoints
          .map((point) =>
            pointEntity(
              point.coordinate,
              point.pointName.trim() ||
                point.pointCode,
            ),
          )
          .join("");

      downloadTextFile(
        `0\nSECTION\n2\nHEADER\n` +
          `999\nSabahLot preliminary DXF export. Coordinates are WGS84 longitude/latitude; no projected meter transform has been applied.\n` +
          `9\n$INSUNITS\n70\n0\n` +
          `0\nENDSEC\n` +
          `0\nSECTION\n2\nTABLES\n${layerTable}0\nENDSEC\n` +
          `0\nSECTION\n2\nENTITIES\n` +
          `${objectEntities}${pointEntities}` +
          `0\nENDSEC\n0\nEOF\n`,
        `${safeFileName}.dxf`,
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
        initialDrawingObjects={
          drawingObjects
        }
        initialActiveObjectId={
          activeObjectId
        }
        onPolygonChange={setPolygon}
        onDrawingObjectsChange={
          handleDrawingObjectsChange
        }
        onManualPointsChange={
          setManualPoints
        }
        onActiveObjectChange={
          setActiveObjectId
        }
        hasUnsavedChanges={
          hasUnsavedChanges
        }
        onSaveLot={
          saveLotRecord
        }
        onExportPdf={
          exportPdfPlan
        }
        onExportKml={exportKml}
        onExportDxf={exportDxf}
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
              className={`sl-save-button ${
                hasUnsavedChanges
                  ? "is-unsaved"
                  : ""
              }`}
              disabled={
                isSaving ||
                !canSaveLot
              }
              title={
                canSaveLot
                  ? text.save
                  : text.polygonRequired
              }
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
                  placeholder="Example: Lot Arrangement for Discussion"
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
                  Surveyor / Plotter Name
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.surveyor
                      .name
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "surveyor",
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Surveyor / Plotter IC / ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.surveyor
                      .idNo
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "surveyor",
                      "idNo",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Witness Name
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.witness
                      .name
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "witness",
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Witness IC / ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.witness
                      .idNo
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "witness",
                      "idNo",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Village Head / JPKK Name
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.villageHead
                      .name
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "villageHead",
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Village Head / JPKK IC / ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.villageHead
                      .idNo
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "villageHead",
                      "idNo",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Applicant / Landowner Name
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.applicant
                      .name
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "applicant",
                      "name",
                      event.target.value,
                    )
                  }
                  placeholder="Optional"
                  autoComplete="off"
                />
              </label>

              <label>
                <span>
                  Applicant / Landowner IC / ID No.
                </span>

                <input
                  type="text"
                  value={
                    pdfIdentities.applicant
                      .idNo
                  }
                  onChange={(event) =>
                    updatePdfIdentity(
                      "applicant",
                      "idNo",
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
