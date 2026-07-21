 "use client";

import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useState,
} from "react";

import Map, {
  formatAreaDisplay,
  type ManualPointExport,
} from "./components/Map";

import FieldGpsLite from "@/components/FieldGpsLite";

import BetaNoticeModal from "@/components/beta/BetaNoticeModal";
import PublicBetaLabel from "@/components/beta/PublicBetaLabel";

import {
  createClient,
} from "@/lib/supabase/client";
import {
  buildDxfDocument,
  buildKmlDocument,
} from "@/lib/export-workflows";
import {
  buildPreliminaryCsv,
  buildPreliminaryGeoJson,
  buildPreliminaryKml,
  buildPreliminaryPrintHtml,
} from "@/lib/export-geometries";

import {
  deleteLocalLot,
  getLocalLots,
  EMPTY_LAND_RECORD,
  LOCAL_LOT_SCHEMA_VERSION,
  type LocalLotRecord,
  type LandRecordDetails,
  type AvailableRecord,
  type LandIssueTag,
  markLocalLotSynced,
  normalizeLandRecordDetails,
  saveLocalLot,
} from "@/lib/local-lots";
import {
  createImportedDrawingObject,
  parseImportedGeometry,
  type ImportedGeometryPreview,
  type ImportFileStatus,
} from "@/lib/import-geometries";
import {
  createKeyedCoordinatePoint,
} from "@/lib/field-gps";

import {
  syncParentGeometryToCloud,
  syncParentLandRecordToCloud,
  type GeometryUiSyncResult,
  type ParentSyncResult,
} from "@/lib/land-records";

import type {
  AppLanguage,
  AreaUnit,
  Coordinate,
  PolygonResult,
} from "./components/Map";

import type {
  DrawingObject,
} from "@/lib/drawing-types";

import {
  getStoredLanguage,
  setStoredLanguage,
} from "@/lib/i18n/appLanguageStorage";
import {
  type AppMode,
  getStoredAppMode,
  setStoredAppMode,
} from "@/lib/appMode/appModeStorage";
import {
  type RegionId,
  getStoredRegion,
  setStoredRegion,
} from "@/lib/region/regionStorage";
import { getAppText, type ModuleId } from "@/lib/i18n/appText";

import CategoryDrawer from "@/components/shell/CategoryDrawer";
import NcrScreen from "@/components/ncr/NcrScreen";
import ServiceRequestScreen from "@/components/serviceRequest/ServiceRequestScreen";
import FeedbackModal from "@/components/feedback/FeedbackModal";

import type {
  OfflineMapView,
} from "@/lib/offline-map-cache";

interface LotFormData {
  ownerName: string;
  lotNumber: string;
  village: string;
  district: string;
  notes: string;
  landRecord: LandRecordDetails;
}

interface SavedLotRecord extends LotFormData {
  projectId?: string | null;
  polygon: PolygonResult | null;
  drawingObjects?: DrawingObject[];
  manualPoints?: ManualPointExport[];
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
  notes?: string;
  landRecord?: unknown;
  polygon?: PolygonResult | null;
  drawingObjects?: DrawingObject[];
  manualPoints?: ManualPointExport[];
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

const PRELIMINARY_DISCLAIMER =
  "Preliminary Field Assist output is for field reference only. Measurements are user-created estimates and should be checked with the appropriate professional or authority before formal use.";

const IMPORT_DISCLAIMER =
  "Imported files are used for preliminary reference only. Coordinates, boundaries and areas must be verified by the relevant authority, licensed surveyor or professional adviser before any official use.";

const IMPORT_STATUS_LABEL: Record<ImportFileStatus, string> = {
  no_file: "No file selected",
  file_loaded: "File loaded",
  preview_ready: "Geometry preview ready",
  failed: "Import failed",
  unsupported: "Unsupported file",
};

function createPolygonFingerprint(
  coordinates: Coordinate[],
): string {
  return coordinates
    .map(
      ({ lat, lng }) =>
        `${lat.toFixed(7)},${lng.toFixed(7)}`,
    )
    .join("|");
}

const EMPTY_FORM: LotFormData = {
  ownerName: "",
  lotNumber: "",
  village: "",
  district: "",
  notes: "",
  landRecord: {
    ...EMPTY_LAND_RECORD,
  },
};

const LAND_CASE_OPTIONS = [
  ["land_application", "Permohonan tanah"],
  ["inheritance_land", "Tanah pusaka"],
  ["family_customary_land", "Tanah adat keluarga"],
  ["titled_land", "Sudah mempunyai geran"],
  ["unsure", "Tidak pasti"],
] as const;

const AVAILABLE_RECORD_OPTIONS: ReadonlyArray<readonly [AvailableRecord, string]> = [
  ["title", "Geran"],
  ["official_receipt", "Resit rasmi"],
  ["application_letter", "Surat permohonan"],
  ["plan_or_sketch", "Pelan/lakaran"],
  ["gps_coordinates", "Koordinat GPS"],
  ["site_photos", "Gambar lokasi"],
  ["no_record", "Tiada rekod"],
];

const APPLICATION_AGE_OPTIONS = [
  ["under_5_years", "Kurang 5 tahun"],
  ["5_to_10_years", "5-10 tahun"],
  ["10_to_20_years", "10-20 tahun"],
  ["over_20_years", "Lebih 20 tahun"],
  ["unsure", "Tidak pasti"],
] as const;

const ISSUE_TAG_OPTIONS: ReadonlyArray<readonly [LandIssueTag, string]> = [
  ["unknown_application_status", "Tidak tahu status permohonan"],
  ["difficult_to_get_information", "Sukar mendapatkan maklumat"],
  ["lost_documents", "Dokumen hilang"],
  ["unknown_land_location", "Tidak tahu lokasi tanah"],
  ["unclear_land_process", "Tidak faham proses tanah"],
  ["boundary_dispute", "Pertikaian sempadan"],
  ["title_subdivision", "Pecah geran"],
  ["customary_land_ncr", "Tanah adat / NCR"],
  ["encroachment", "Pencerobohan"],
  ["overlapping_land", "Tanah bertindih"],
];

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
      "Create a preliminary user-created record for planning and reference only.",

    ownerName:
      "Owner name",

    lotNumber:
      "Lot number",

    village:
      "Village",

    district:
      "District",

    ownerPlaceholder:
      "Example: Ali bin Baba",

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

    parentCloudSyncSaving:
      "Syncing record to cloud...",

    parentCloudSyncSynced:
      "Land record details synced to cloud (boundary, points and parties are separate).",

    parentCloudSyncLocalOnlyGateDisabled:
      "Saved locally only. Cloud sync is off in this environment.",

    parentCloudSyncLocalOnlyLegacyId:
      "Saved locally only. This record predates cloud sync and cannot be uploaded automatically.",

    parentCloudSyncNoSession:
      "Saved locally. Sign in to sync this record to the cloud.",

    parentCloudSyncInvalidInput:
      "Cloud sync skipped: some fields are not valid for cloud sync.",

    parentCloudSyncDuplicateConflict:
      "Cloud sync skipped: a different cloud record already exists with this id.",

    parentCloudSyncStaleConflict:
      "This record changed elsewhere. Reload it before saving again to avoid overwriting newer cloud data.",

    parentCloudSyncFailed:
      "Cloud sync failed. Your local copy is safe and will retry on the next save.",

    geometryCloudSyncSaving:
      "Syncing the parent boundary to cloud...",

    geometryCloudSyncSynced:
      "Parent boundary synced to cloud.",

    geometryCloudSyncParentNotSynced:
      "Boundary kept locally because the parent land record was not synced.",

    geometryCloudSyncNoParentGeometry:
      "No parent boundary was selected for cloud sync.",

    geometryCloudSyncInvalidInput:
      "Boundary cloud sync skipped because the active geometry is not valid for this record.",

    geometryCloudSyncConflict:
      "The boundary changed elsewhere. Reload it before saving again.",

    geometryCloudSyncFailed:
      "Boundary cloud sync failed. Your local boundary is safe.",

    polygonRequired:
      "Please draw a land area before saving this preliminary record.",

    titleRequired:
      "Please enter a record name or lot reference before saving this preliminary record.",

    areaRequired:
      "Please draw a valid land area before saving this preliminary record.",

    confirmUpdateExisting:
      "Update the loaded preliminary record? Choose Cancel to save this as a new record instead.",

    savedAsNew:
      "Saved as a new preliminary record.",

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
      "Estimated area",

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
      "Cipta rekod awal pengguna untuk rujukan dan perancangan sahaja.",

    ownerName:
      "Nama pemilik",

    lotNumber:
      "Nombor lot",

    village:
      "Kampung",

    district:
      "Daerah",

    ownerPlaceholder:
      "Contoh: Ali bin Baba",

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

    parentCloudSyncSaving:
      "Menyegerakkan rekod ke awan...",

    parentCloudSyncSynced:
      "Butiran rekod tanah disegerakkan ke awan (sempadan, titik dan pihak berkaitan adalah berasingan).",

    parentCloudSyncLocalOnlyGateDisabled:
      "Hanya disimpan pada peranti ini. Penyegerakan awan dimatikan dalam persekitaran ini.",

    parentCloudSyncLocalOnlyLegacyId:
      "Hanya disimpan pada peranti ini. Rekod ini dicipta sebelum penyegerakan awan wujud dan tidak boleh dimuat naik secara automatik.",

    parentCloudSyncNoSession:
      "Disimpan pada peranti ini. Log masuk untuk menyegerakkan rekod ini ke awan.",

    parentCloudSyncInvalidInput:
      "Penyegerakan awan dilangkau: sebahagian medan tidak sah untuk penyegerakan awan.",

    parentCloudSyncDuplicateConflict:
      "Penyegerakan awan dilangkau: rekod awan lain dengan id ini sudah wujud.",

    parentCloudSyncStaleConflict:
      "Rekod ini telah berubah di tempat lain. Muat semula sebelum menyimpan lagi supaya data awan terkini tidak tertindih.",

    parentCloudSyncFailed:
      "Penyegerakan awan gagal. Salinan pada peranti ini selamat dan akan dicuba semula pada simpanan seterusnya.",

    geometryCloudSyncSaving:
      "Menyegerakkan sempadan induk ke awan...",

    geometryCloudSyncSynced:
      "Sempadan induk disegerakkan ke awan.",

    geometryCloudSyncParentNotSynced:
      "Sempadan kekal pada peranti kerana rekod tanah induk belum disegerakkan.",

    geometryCloudSyncNoParentGeometry:
      "Tiada sempadan induk dipilih untuk penyegerakan awan.",

    geometryCloudSyncInvalidInput:
      "Penyegerakan sempadan dilangkau kerana geometri aktif tidak sah untuk rekod ini.",

    geometryCloudSyncConflict:
      "Sempadan telah berubah di tempat lain. Muat semula sebelum menyimpan lagi.",

    geometryCloudSyncFailed:
      "Penyegerakan sempadan gagal. Sempadan pada peranti ini selamat.",

    polygonRequired:
      "Sila lukis kawasan tanah sebelum menyimpan rekod awal ini.",

    titleRequired:
      "Sila masukkan nama rekod atau rujukan lot sebelum menyimpan rekod awal ini.",

    areaRequired:
      "Sila lukis kawasan tanah yang sah sebelum menyimpan rekod awal ini.",

    confirmUpdateExisting:
      "Kemas kini rekod awal yang dimuatkan? Pilih Cancel untuk simpan sebagai rekod baharu.",

    savedAsNew:
      "Disimpan sebagai rekod awal baharu.",

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
      "Anggaran keluasan",

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

  zh: {
    panelTitle:
      "地块信息",

    panelDescription:
      "创建初步用户记录,仅供规划与参考之用。",

    ownerName:
      "业主姓名",

    lotNumber:
      "地块编号",

    village:
      "村庄",

    district:
      "县/区",

    ownerPlaceholder:
      "例如: Ali bin Baba",

    lotPlaceholder:
      "例如: Lot 69467",

    villagePlaceholder:
      "例如: Kg. Kinabalu",

    districtPlaceholder:
      "例如: Kota Marudu",

    save:
      "Save Lot",

    saving:
      "保存中...",

    saved:
      "地块已成功保存到此设备。",

    savedSuccessfully:
      "Lot saved locally and synced to cloud.",

    cloudSyncFailed:
      "Lot saved locally. Cloud sync is currently unavailable.",

    savedLocalSignIn:
      "Project saved locally.",

    parentCloudSyncSaving:
      "正在同步记录到云端...",

    parentCloudSyncSynced:
      "土地记录详情已同步到云端(边界、点位与相关人士为另外的部分)。",

    parentCloudSyncLocalOnlyGateDisabled:
      "仅保存在本设备。此环境已关闭云端同步。",

    parentCloudSyncLocalOnlyLegacyId:
      "仅保存在本设备。此记录早于云端同步功能,无法自动上传。",

    parentCloudSyncNoSession:
      "已保存在本设备。请登录以将此记录同步到云端。",

    parentCloudSyncInvalidInput:
      "已跳过云端同步:部分字段对云端同步无效。",

    parentCloudSyncDuplicateConflict:
      "已跳过云端同步:已存在具有相同 id 的其他云端记录。",

    parentCloudSyncStaleConflict:
      "此记录已在别处更改。请先重新载入,再保存,以免覆盖较新的云端数据。",

    parentCloudSyncFailed:
      "云端同步失败。本设备副本安全,将在下次保存时重试。",

    geometryCloudSyncSaving:
      "正在同步主地块边界到云端...",

    geometryCloudSyncSynced:
      "主地块边界已同步到云端。",

    geometryCloudSyncParentNotSynced:
      "由于土地记录尚未同步,边界仅保存在本设备。",

    geometryCloudSyncNoParentGeometry:
      "没有选择用于云端同步的主地块边界。",

    geometryCloudSyncInvalidInput:
      "当前几何不适用于此记录,已跳过边界云端同步。",

    geometryCloudSyncConflict:
      "边界已在其他位置更改。请重新加载后再保存。",

    geometryCloudSyncFailed:
      "边界云端同步失败。本设备上的边界数据安全。",

    polygonRequired:
      "保存此初步记录前,请先绘制土地范围。",

    titleRequired:
      "保存此初步记录前,请输入记录名称或地块编号。",

    areaRequired:
      "保存此初步记录前,请绘制有效的土地范围。",

    confirmUpdateExisting:
      "更新已载入的初步记录?选择取消将另存为新记录。",

    savedAsNew:
      "已另存为新的初步记录。",

    saveFailed:
      "保存地块失败。",

    savedLots:
      "Saved Lots",

    loadLots:
      "载入已保存的地块",

    loadingLots:
      "正在载入地块...",

    noSavedLots:
      "尚无已保存的地块。",

    loadFailed:
      "载入地块失败。",

    load:
      "Load",

    delete:
      "Delete",

    deleteFailed:
      "无法删除已保存的地块。",

    deleted:
      "本地记录已删除。",

    loaded:
      "地块已成功载入。",

    confirmDelete:
      "删除此本地记录?",

    local:
      "Local",

    synced:
      "Synced",

    storedOnDevice:
      "已保存在此设备",

    restored:
      "先前的地块信息已还原。",

    close:
      "关闭地块信息",

    summary:
      "绘制摘要",

    points:
      "点数",

    area:
      "估计面积",

    perimeter:
      "周长",

    noPolygon:
      "尚未完成任何多边形。",

    exportPdf:
      "导出PDF图纸",

    exportingPdf:
      "正在生成PDF...",

    exportPdfFailed:
      "无法生成PDF图纸。",

    exportPdfSuccess:
      "PDF已成功生成。",

    outputOptions:
      "输出选项",

    outputLanguage:
      "报告语言",

    outputFormat:
      "输出格式",

    exportOutput:
      "生成输出",

    exportOutputSuccess:
      "输出已成功生成。",

    clearRecord:
      "清除已保存记录",

    confirmClear:
      "清除此设备上保存的地块信息?",
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
  ] = useState<AppLanguage>(
    "en",
  );

  const [
    appMode,
    setAppMode,
  ] = useState<AppMode>(
    "public",
  );

  const [
    region,
    setRegion,
  ] = useState<RegionId>(
    "sabah",
  );

  const [
    categoryDrawerOpen,
    setCategoryDrawerOpen,
  ] = useState(false);

  const [
    mapToolsRevealToken,
    setMapToolsRevealToken,
  ] = useState(0);

  const [
    ncrScreenOpen,
    setNcrScreenOpen,
  ] = useState(false);

  const [
    serviceRequestOpen,
    setServiceRequestOpen,
  ] = useState(false);

  const [
    feedbackModalOpen,
    setFeedbackModalOpen,
  ] = useState(false);

  const [
    feedbackModalModule,
    setFeedbackModalModule,
  ] = useState("");

  const [
    shellNotice,
    setShellNotice,
  ] = useState("");

  useEffect(() => {
    if (!shellNotice) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setShellNotice("");
    }, 3200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [shellNotice]);

  useEffect(() => {
    queueMicrotask(() => {
      const storedLanguage = getStoredLanguage();
      const storedAppMode = getStoredAppMode();
      const storedRegion = getStoredRegion();

      if (storedLanguage !== language) {
        setLanguage(storedLanguage);
      }

      if (storedAppMode !== appMode) {
        setAppMode(storedAppMode);
      }

      if (storedRegion !== region) {
        setRegion(storedRegion);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    setStoredAppMode(appMode);
  }, [appMode]);

  useEffect(() => {
    setStoredRegion(region);
  }, [region]);

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
    parentCloudSync,
    setParentCloudSync,
  ] = useState<
    { status: "idle" } | { status: "saving" } | ParentSyncResult
  >({ status: "idle" });

  const [
    geometryCloudSync,
    setGeometryCloudSync,
  ] = useState<
    { status: "idle" } | { status: "saving" } | GeometryUiSyncResult
  >({ status: "idle" });

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
  ] = useState<PdfPaperSize>("a3");

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

  const [
    ,
    setMapView,
  ] = useState<OfflineMapView | null>(
    null,
  );

  const [
    importFile,
    setImportFile,
  ] = useState<File | null>(null);

  const [
    importStatus,
    setImportStatus,
  ] = useState<ImportFileStatus>(
    "no_file",
  );

  const [
    importPreview,
    setImportPreview,
  ] = useState<ImportedGeometryPreview | null>(
    null,
  );

  const [
    importError,
    setImportError,
  ] = useState("");

  const [
    isPreviewingImport,
    setIsPreviewingImport,
  ] = useState(false);

  const text =
    PAGE_TEXT[language];

  const planTemplateLabel =
    "Preliminary Land Plan";

  const hasValidPolygon =
    Boolean(
      polygon &&
        polygon.coordinates.length >= 3,
    );
  const hasRecordTitle =
    formData.lotNumber.trim().length > 0;
  const hasPositiveArea =
    Boolean(
      polygon &&
        Number.isFinite(polygon.areaM2) &&
        polygon.areaM2 > 0,
    );
  const canSaveLot =
    hasValidPolygon &&
    hasRecordTitle &&
    hasPositiveArea;
  const saveBlockedMessage =
    !hasValidPolygon
      ? text.polygonRequired
      : !hasPositiveArea
        ? text.areaRequired
        : text.titleRequired;

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
    const warning = cloudSyncWarning(error);

    const warningMessage = String(
      (warning as { message?: unknown }).message ?? "",
    );

    if (
      warningMessage
        .toLowerCase()
        .includes("auth session missing")
    ) {
      return;
    }

    console.warn(
      "SabahLot cloud sync unavailable:",
      warning,
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

      queueMicrotask(() => {
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

        notes:
          parsedRecord.notes ??
          "",

        landRecord:
          normalizeLandRecordDetails(
            parsedRecord.landRecord,
          ),
      });
  });

      queueMicrotask(() => {
    setPolygon(
        parsedRecord.polygon ??
          null,
      );
  });

      queueMicrotask(() => {
    setCurrentProjectId(
        parsedRecord.projectId ??
          null,
      );
  });

      queueMicrotask(() => {
    setDrawingObjects(
        parsedRecord.drawingObjects ??
          [],
      );
  });

      queueMicrotask(() => {
    setManualPoints(
        parsedRecord.manualPoints ??
          [],
      );
  });

      queueMicrotask(() => {
    setActiveObjectId(
        parsedRecord.activeObjectId ??
          parsedRecord.drawingObjects?.[0]
            ?.id ??
          null,
      );
  });

      queueMicrotask(() => {
    setPdfIdentities(
        normalizePdfIdentities(
          parsedRecord.pdfIdentities,
        ),
      );
  });

      if (
        parsedRecord.polygon?.coordinates
      ) {
        queueMicrotask(() => {
    setLoadedCoordinates(
          parsedRecord.polygon!.coordinates,
        );
  });
      }

      queueMicrotask(() => {
    setSaveMessage(
        PAGE_TEXT.en.restored,
      );
  });
      queueMicrotask(() => {
    setHasUnsavedChanges(false);
  });
    } catch {
      window.localStorage.removeItem(
        STORAGE_KEY,
      );
    }
  }, []);

  useEffect(() => {
    try {
      const storedLocalLots =
        getLocalLots();

      queueMicrotask(() => {
        setLocalLots(storedLocalLots);
      });
    } catch {
      queueMicrotask(() => {
        setSaveMessage(
          PAGE_TEXT.en.loadFailed,
        );
      });
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
        manualPoints,
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
    manualPoints,
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
    field: Exclude<keyof LotFormData, "landRecord">,
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

  const updateLandRecordField = <K extends keyof LandRecordDetails>(
    field: K,
    value: LandRecordDetails[K],
  ) => {
    setHasUnsavedChanges(true);
    setFormData((current) => ({
      ...current,
      landRecord: {
        ...current.landRecord,
        [field]: value,
      },
    }));
  };

  const toggleAvailableRecord = (record: AvailableRecord) => {
    const current = formData.landRecord.recordsAvailable;
    const next = current.includes(record)
      ? current.filter((item) => item !== record)
      : record === "no_record"
        ? [record]
        : [...current.filter((item) => item !== "no_record"), record];
    updateLandRecordField("recordsAvailable", next);
  };

  const toggleIssueTag = (tag: LandIssueTag) => {
    const current = formData.landRecord.issueTags;
    updateLandRecordField(
      "issueTags",
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag],
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

  const openCategoryDrawer =
    () => {
      setCategoryDrawerOpen(true);
    };

  const closeCategoryDrawer =
    () => {
      setCategoryDrawerOpen(false);
    };

  const openFeedback =
    (moduleId: string) => {
      setFeedbackModalModule(moduleId);
      setFeedbackModalOpen(true);
    };

  const closeFeedback =
    () => {
      setFeedbackModalOpen(false);
    };

  const handleSelectCategory = (
    categoryId: ModuleId,
  ) => {
    closeCategoryDrawer();

    switch (categoryId) {
      case "ncr":
        setNcrScreenOpen(true);
        break;

      case "land_management":
      case "plans_export":
        openLotPanel();
        break;

      case "map_drawing":
        setMapToolsRevealToken((token) => token + 1);
        break;

      case "field_work":
        if (appMode !== "advanced") {
          setShellNotice(
            getAppText(language).fieldWorkPublicNudge,
          );
        }
        break;

      case "service_request":
        setServiceRequestOpen(true);
        break;

      case "help_guide":
        if (typeof window !== "undefined") {
          window.location.assign("/manual-beta");
        }
        break;

      case "feedback":
        openFeedback(getAppText(language).modules.feedback.label);
        break;

      default:
        break;
    }
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

  const handleImportFileChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0] ?? null;

    setImportFile(file);
    setImportPreview(null);
    setImportError("");
    setImportStatus(
      file
        ? "file_loaded"
        : "no_file",
    );
  };

  const previewImportFile = async () => {
    if (!importFile) {
      setImportStatus("no_file");
      setImportError("Select a KML, GeoJSON or CSV file first.");
      return;
    }

    setIsPreviewingImport(true);
    setImportError("");

    try {
      const source =
        await importFile.text();
      const preview =
        parseImportedGeometry(
          importFile.name,
          source,
          {
            language,
            areaUnit:
              selectedAreaUnit,
          },
        );

      setImportPreview(preview);
      setImportStatus("preview_ready");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The file could not be imported.";

      setImportPreview(null);
      setImportError(message);
      setImportStatus(
        message.toLowerCase().includes("unsupported") ||
          message.toLowerCase().includes("dxf")
          ? "unsupported"
          : "failed",
      );
    } finally {
      setIsPreviewingImport(false);
    }
  };

  const useImportedGeometry = () => {
    if (!importPreview) {
      setImportError("Preview a valid import file first.");
      return;
    }

    if (
      importPreview.kind !== "polygon" ||
      !importPreview.polygon
    ) {
      setImportError(
        "Only polygon imports can be used as a SabahLot record in this build.",
      );
      return;
    }

    const importedObject =
      createImportedDrawingObject(
        importPreview,
      );

    if (!importedObject) {
      setImportError("Imported geometry is not a valid polygon.");
      setImportStatus("failed");
      return;
    }

    setPolygon(importPreview.polygon);
    setLoadedCoordinates(
      importPreview.polygon.coordinates,
    );
    setDrawingObjects([
      importedObject,
    ]);
    setActiveObjectId(
      importedObject.id,
    );
    setCurrentProjectId(null);
    setHasUnsavedChanges(true);
    setImportError("");
    setImportStatus("preview_ready");

    if (
      formData.lotNumber.trim()
        .length === 0
    ) {
      setFormData((current) => ({
        ...current,
        lotNumber:
          importPreview.name,
      }));
    }

    setSaveMessage(
      "Imported polygon applied as a preliminary SabahLot record.",
    );
  };

  const useImportedPoint = () => {
    if (!importPreview) {
      setImportError("Preview a valid import file first.");
      return;
    }

    if (
      importPreview.kind !== "point" ||
      importPreview.coordinates.length !== 1
    ) {
      setImportError(
        "Only a single-point import can be added as a field point.",
      );
      return;
    }

    const coordinate =
      importPreview.coordinates[0];
    const point =
      createKeyedCoordinatePoint(
        coordinate.lat,
        coordinate.lng,
        importPreview.name || "Imported point",
        `Imported from ${importPreview.format} file.`,
      );

    window.dispatchEvent(
      new CustomEvent(
        "sabahlot:add-field-gps-point",
        {
          detail: {
            point,
          },
        },
      ),
    );

    setImportError("");
    setSaveMessage(
      `${point.label} added as a field point from ${importPreview.format} import.`,
    );
  };

  const saveLotRecord = (
    event?:
      FormEvent<HTMLFormElement>,
  ) => {
    event?.preventDefault();

    const save =
      async () => {
        const lotName =
          formData.lotNumber.trim();

        if (
          !polygon ||
          polygon.coordinates.length < 3
        ) {
          setSaveMessage(
            text.polygonRequired,
          );

          return;
        }

        if (!lotName) {
          setSaveMessage(
            text.titleRequired,
          );

          return;
        }

        if (
          !Number.isFinite(
            polygon.areaM2,
          ) ||
          polygon.areaM2 <= 0
        ) {
          setSaveMessage(
            text.areaRequired,
          );

          return;
        }

        let projectIdForSave =
          currentProjectId;
        let savingAsNewRecord =
          false;
        const loadedLocalRecord =
          currentProjectId
            ? localLots.find(
                (lot) =>
                  lot.id ===
                  currentProjectId,
              )
            : undefined;

        if (loadedLocalRecord) {
          const nextFingerprint =
            createPolygonFingerprint(
              polygon.coordinates,
            );
          const recordChanged =
            loadedLocalRecord.lot_name !==
              lotName ||
            loadedLocalRecord.polygon_fingerprint !==
              nextFingerprint;

          if (
            recordChanged &&
            !window.confirm(
              text.confirmUpdateExisting,
            )
          ) {
            projectIdForSave =
              null;
            savingAsNewRecord =
              true;
          }
        }

        setIsSaving(true);

        let localRecord: LocalLotRecord;

        try {
          localRecord = saveLocalLot({
            projectId:
              projectIdForSave,
            lotName,
            lotNumber:
              formData.lotNumber,
            ownerName:
              formData.ownerName,
            village:
              formData.village,
            district:
              formData.district,
            notes:
              formData.notes,
            landRecord:
              formData.landRecord,
            polygon,
            drawingObjects,
            manualPoints,
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

        // Parent first, then its one authoritative `parent_lot` boundary.
        // Geometry never runs under an unsettled parent and reports through
        // its own state so a partial save cannot look fully synchronized.
        setParentCloudSync({ status: "saving" });
        setGeometryCloudSync({ status: "idle" });
        const cloudClient = createClient();
        let parentSyncResult: ParentSyncResult;

        try {
          parentSyncResult = await syncParentLandRecordToCloud(
            cloudClient,
            {
                localId: localRecord.id,
                recordName: lotName,
                lotNumber:
                  formData.lotNumber.trim() || null,
                village:
                  formData.village.trim() || null,
                district:
                  formData.district.trim() || null,
                region,
                landCaseType:
                  formData.landRecord.landCaseType || null,
                applicationAge:
                  formData.landRecord.applicationAge || null,
                recordsAvailable:
                  formData.landRecord.recordsAvailable,
                issueTags:
                  formData.landRecord.issueTags,
                heirsCanIdentifyLocation:
                  formData.landRecord.heirsCanIdentifyLocation ||
                  null,
                landHistoryNotes:
                  formData.landRecord.landHistoryNotes.trim() ||
                  null,
            },
          );

          setParentCloudSync(parentSyncResult);
        } catch (error) {
          parentSyncResult = {
            status: "network_error",
            message:
              error instanceof Error
                ? error.message
                : "Unknown cloud sync error.",
          };
          setParentCloudSync(parentSyncResult);
        }

        setGeometryCloudSync({ status: "saving" });
        const geometrySyncResult = await syncParentGeometryToCloud(
          cloudClient,
          parentSyncResult,
          drawingObjects,
        );
        setGeometryCloudSync(geometrySyncResult);

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
            savingAsNewRecord
              ? text.savedAsNew
              : text.savedLocalSignIn,
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
              manualPoints,
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
      setManualPoints([]);
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
        notes: lot.notes ?? "",
        landRecord:
          normalizeLandRecordDetails(
            lot.land_record,
          ),
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
      setManualPoints(
        lot.manual_points ?? [],
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
      const nextLocalLots =
        deleteLocalLot(lotId);

      setLocalLots(nextLocalLots);

      if (currentProjectId === lotId) {
        window.localStorage.removeItem(
          STORAGE_KEY,
        );
        setCurrentProjectId(null);
        setFormData(EMPTY_FORM);
        setPolygon(null);
        setLoadedCoordinates(undefined);
        setDrawingObjects([]);
        setManualPoints([]);
        setActiveObjectId(null);
        setHasUnsavedChanges(false);
      }

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
      setManualPoints([]);
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
          "No current visible polygon to export.",
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
          "Unnamed preliminary record";

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
          PRELIMINARY_DISCLAIMER;

        const preliminaryNotice =
          "PRELIMINARY ONLY";

        const formatPdfDistance = (
          distanceM?: number,
        ) =>
          typeof distanceM === "number"
            ? `${distanceM.toFixed(2)} m`
            : "";

        const formatPdfBearing = (
          bearingDecimal?: number,
        ) => {
          if (
            typeof bearingDecimal !== "number" ||
            !Number.isFinite(bearingDecimal)
          ) {
            return "";
          }

          const normalized =
            ((bearingDecimal % 360) + 360) % 360;

          let degrees = Math.floor(normalized);

          const minuteValue =
            (normalized - degrees) * 60;

          let minutes = Math.floor(minuteValue);

          let seconds = Math.round(
            (minuteValue - minutes) * 60,
          );

          if (seconds === 60) {
            seconds = 0;
            minutes += 1;
          }

          if (minutes === 60) {
            minutes = 0;
            degrees = (degrees + 1) % 360;
          }

          return `${String(degrees).padStart(
            3,
            "0",
          )}\u00b0 ${String(minutes).padStart(
            2,
            "0",
          )}' ${String(seconds).padStart(
            2,
            "0",
          )}"`;
        };

        const reportText =
          {
            plan:
              planTemplateLabel,
            area:
              "Estimated Area",
            coordinates:
              "Coordinate Table",
            point:
              "Point / No.",
            latitude:
              "Latitude",
            longitude:
              "Longitude",
            distance:
              "Distance",
            bearing:
              "Bearing",
            z:
              "Z",
            generated:
              "Generated",
          };

        const polygonPointCount =
          polygon.coordinates.length;
        const useFullCoordinateTable =
          polygonPointCount > 15;
        const pdfSegmentLabelStep =
          polygonPointCount <= 6
            ? 1
            : polygonPointCount <= 10
              ? 2
              : polygonPointCount <= 15
                ? 3
                : Number.POSITIVE_INFINITY;
        const shouldDrawPdfSegmentLabel = (
          segmentIndex: number,
        ) =>
          polygonPointCount <= 6 ||
          (
            polygonPointCount <= 15 &&
            segmentIndex %
              pdfSegmentLabelStep ===
              0
          );

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
        void addPlanInfoPanel;

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
        void addStationSchedulePanel;

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
                ? "SabahLot powered by Myukur Alpha"
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
        void addBottomTitleBlock;

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

        const addKeyPlan = async (
          x: number,
          y: number,
          width: number,
          height: number,
          _snapshotData: string | null,
        ) => {
          void _snapshotData;

          const calculateSiteCentre =
            () => {
              if (
                polygon.coordinates.length === 0
              ) {
                return {
                  lat: 5.9804,
                  lng: 116.0735,
                };
              }

              const total =
                polygon.coordinates.reduce(
                  (
                    sum,
                    coordinate,
                  ) => ({
                    lat:
                      sum.lat +
                      coordinate.lat,
                    lng:
                      sum.lng +
                      coordinate.lng,
                  }),
                  {
                    lat: 0,
                    lng: 0,
                  },
                );

              return {
                lat:
                  total.lat /
                  polygon.coordinates.length,
                lng:
                  total.lng /
                  polygon.coordinates.length,
              };
            };

          const siteCentre =
            calculateSiteCentre();

          const centreLat =
            siteCentre.lat;
          const centreLng =
            siteCentre.lng;

          pdf.setDrawColor(
            148,
            163,
            184,
          );
          pdf.setLineWidth(
            0.35,
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.rect(
            x,
            y,
            width,
            height,
            "FD",
          );

          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            5.8,
          );
          pdf.setTextColor(
            0,
            0,
            0,
          );
          pdf.text(
            "KEY PLAN",
            x + 2.2,
            y + 4.7,
          );
          pdf.text(
            "PETA SABAH",
            x + width - 2.2,
            y + 4.7,
            {
              align:
                "right",
              maxWidth:
                width * 0.48,
            },
          );

          const mapLeft =
            x + 1.2;
          const mapTop =
            y + 7.0;
          const mapWidth =
            width - 2.4;
          const mapHeight =
            height - 13.4;

          const footerTop =
            y +
            height -
            5.0;

          pdf.setFillColor(
            223,
            236,
            248,
          );
          pdf.rect(
            mapLeft,
            mapTop,
            mapWidth,
            mapHeight,
            "F",
          );

          let imageLeft =
            mapLeft;
          let imageTop =
            mapTop;
          let imageWidth =
            mapWidth;
          let imageHeight =
            mapHeight;

          try {
            const response =
              await fetch(
                "/keyplan/sabah-map.png?v=" +
                  Date.now(),
                {
                  cache:
                    "no-store",
                },
              );

            if (!response.ok) {
              throw new Error(
                "Sabah map not found",
              );
            }

            const blob =
              await response.blob();

            const imageDataUrl =
              await new Promise<string>(
                (
                  resolve,
                  reject,
                ) => {
                  const reader =
                    new FileReader();

                  reader.onloadend =
                    () =>
                      resolve(
                        String(
                          reader.result ??
                            "",
                        ),
                      );

                  reader.onerror =
                    () =>
                      reject(
                        new Error(
                          "Failed to read image",
                        ),
                      );

                  reader.readAsDataURL(
                    blob,
                  );
                },
              );

            const imageSize =
              await new Promise<{
                width: number;
                height: number;
              }>(
                (
                  resolve,
                  reject,
                ) => {
                  const image =
                    new Image();

                  image.onload =
                    () =>
                      resolve({
                        width:
                          image.naturalWidth ||
                          image.width,
                        height:
                          image.naturalHeight ||
                          image.height,
                      });

                  image.onerror =
                    () =>
                      reject(
                        new Error(
                          "Failed to load image",
                        ),
                      );

                  image.src =
                    imageDataUrl;
                },
              );

            const panelAspect =
              mapWidth /
              Math.max(
                1,
                mapHeight,
              );

            const imageAspect =
              imageSize.width /
              Math.max(
                1,
                imageSize.height,
              );

            if (
              imageAspect >
              panelAspect
            ) {
              imageWidth =
                mapWidth;
              imageHeight =
                mapWidth /
                imageAspect;
            } else {
              imageHeight =
                mapHeight;
              imageWidth =
                mapHeight *
                imageAspect;
            }

            imageLeft =
              mapLeft +
              (
                mapWidth -
                imageWidth
              ) /
                2;

            imageTop =
              mapTop +
              (
                mapHeight -
                imageHeight
              ) /
                2;

            pdf.addImage(
              imageDataUrl,
              "PNG",
              imageLeft,
              imageTop,
              imageWidth,
              imageHeight,
              undefined,
              "FAST",
            );
          } catch {
            pdf.setFont(
              "helvetica",
              "italic",
            );
            pdf.setFontSize(
              6,
            );
            pdf.setTextColor(
              185,
              28,
              28,
            );
            pdf.text(
              "Sabah map image not found",
              mapLeft +
                mapWidth / 2,
              mapTop +
                mapHeight / 2,
              {
                align:
                  "center",
              },
            );
          }

          const viewMinLat =
            4.0;
          const viewMaxLat =
            7.6;
          const viewMinLng =
            115.0;
          const viewMaxLng =
            119.8;

          const markerX =
            Math.max(
              imageLeft + 2.2,
              Math.min(
                imageLeft +
                  imageWidth -
                  2.2,
                imageLeft +
                  ((centreLng -
                    viewMinLng) /
                    (viewMaxLng -
                      viewMinLng)) *
                    imageWidth,
              ),
            );

          const markerY =
            Math.max(
              imageTop + 2.2,
              Math.min(
                imageTop +
                  imageHeight -
                  2.2,
                imageTop +
                  ((viewMaxLat -
                    centreLat) /
                    (viewMaxLat -
                      viewMinLat)) *
                    imageHeight,
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
            2.25,
            "FD",
          );
          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.circle(
            markerX,
            markerY,
            0.42,
            "F",
          );

          pdf.setFont(
            "helvetica",
            "bold",
          );
          pdf.setFontSize(
            6,
          );
          pdf.setTextColor(
            220,
            38,
            38,
          );
          pdf.text(
            "SITE",
            Math.min(
              markerX + 3,
              imageLeft +
                imageWidth -
                2,
            ),
            Math.max(
              markerY - 1,
              imageTop + 3.8,
            ),
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
                markerX + 3,
                imageLeft +
                  imageWidth -
                  2,
              ),
              Math.max(
                markerY + 1.8,
                imageTop + 6.2,
              ),
              {
                maxWidth:
                  imageWidth * 0.3,
              },
            );
          }

          pdf.setFillColor(
            255,
            255,
            255,
          );
          pdf.rect(
            x + 1,
            footerTop,
            width - 2,
            4,
            "F",
          );

          pdf.setFont(
            "helvetica",
            "normal",
          );
          pdf.setFontSize(
            7.8,
          );
          pdf.setTextColor(
            51,
            65,
            85,
          );
          pdf.text(
            `Site centre: ${centreLat.toFixed(5)}, ${centreLng.toFixed(5)}`,
            x + 3,
            y +
              height -
              1.8,
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
              Math.min(
                smallFont,
                5.1,
              ),
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
              4.9;

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

            if (trimmedId) {
              pdf.text(
                `IC / ID No.: ${trimmedId}`,
                cellX +
                  cellWidth /
                  2,
                nameY +
                  2.8,
                {
                  align:
                    "center",
                  maxWidth:
                    cellWidth -
                    6,
                },
              );
            }

            const signatureLineY =
              cellY +
              cellHeight -
              8.6;
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
              1.7;
            pdf.text("",
              cellX +
                cellWidth /
                2,
              lineY,
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
            "Estimated area / perimeter",
            `${displayArea(
              polygon.areaM2,
              "en",
            )} / ${polygon.perimeterM.toFixed(
              2,
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
            "Coordinate / approximate boundary table",
          );
          const coordinateRowHeight =
            5.2;
          const columnEdges = [
            0,
            0.07,
            0.25,
            0.43,
            0.68,
            0.9,
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
                : 4.8,
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
                2,
              {
                align:
                  "center",
                baseline:
                  "middle",
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
                  formatPdfBearing(
                    polygon.segments[index]
                      ?.bearingDecimal,
                  ),
                  formatPdfDistance(
                    polygon.segments[index]
                      ?.distanceM,
                  ),
                  "",
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
              44,
              Math.max(
                38,
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
              24,
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
              disclaimer,
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
          const occupiedPdfLabelBoxes: Array<{
            left: number;
            top: number;
            right: number;
            bottom: number;
          }> = [];
          const labelBoxPadding =
            Math.max(
              5,
              4 *
                overlayScale,
            );
          const boxesOverlap = (
            first: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            },
            second: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            },
          ) =>
            first.left < second.right &&
            first.right > second.left &&
            first.top < second.bottom &&
            first.bottom > second.top;
          const addPdfLabelBox = (
            box: {
              left: number;
              top: number;
              right: number;
              bottom: number;
            },
          ) => {
            if (
              box.right < 0 ||
              box.left > cropWidth ||
              box.bottom < 0 ||
              box.top > cropHeight
            ) {
              return false;
            }

            const collides =
              occupiedPdfLabelBoxes.some(
                (occupiedBox) =>
                  boxesOverlap(
                    box,
                    occupiedBox,
                  ),
              );

            if (collides) {
              return false;
            }

            occupiedPdfLabelBoxes.push(
              box,
            );
            return true;
          };

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

              if (
                polygonPointCount > 6
              ) {
                const pointBoxRadius =
                  markerRadius *
                  1.15;
                occupiedPdfLabelBoxes.push(
                  {
                    left:
                      point.x -
                      pointBoxRadius,
                    top:
                      point.y -
                      pointBoxRadius,
                    right:
                      point.x +
                      pointBoxRadius,
                    bottom:
                      point.y +
                      pointBoxRadius,
                  },
                );
              }
            },
          );

          mapOverlayGeometry.segments.forEach(
            (
              segment,
              segmentIndex,
            ) => {
              if (
                !shouldDrawPdfSegmentLabel(
                  segmentIndex,
                )
              ) {
                return;
              }

              const midpoint =
                toCanvasPoint(
                  segment.midpoint,
                );
              const fontSize =
                Math.max(
                  polygonPointCount <= 6
                    ? 10
                    : 8,
                  (
                    polygonPointCount <= 6
                      ? 10
                      : 8
                  ) *
                    overlayScale,
                );
              const lineGap =
                fontSize *
                1.4;
              const distanceLabel =
                `${segment.distanceText} ${segment.unitText}`;
              croppedMapContext.font =
                `800 ${fontSize}px Arial, sans-serif`;
              const textWidth =
                Math.max(
                  croppedMapContext.measureText(
                    segment.bearing,
                  ).width,
                  croppedMapContext.measureText(
                    distanceLabel,
                  ).width,
                ) +
                labelBoxPadding *
                  2;
              const textHeight =
                lineGap +
                fontSize *
                  1.15 +
                labelBoxPadding;
              const angleRad =
                (
                  segment.angle *
                  Math.PI
                ) /
                180;
              const projectedWidth =
                Math.abs(
                  Math.cos(
                    angleRad,
                  ),
                ) *
                  textWidth +
                Math.abs(
                  Math.sin(
                    angleRad,
                  ),
                ) *
                  textHeight;
              const projectedHeight =
                Math.abs(
                  Math.sin(
                    angleRad,
                  ),
                ) *
                  textWidth +
                Math.abs(
                  Math.cos(
                    angleRad,
                  ),
                ) *
                  textHeight;
              const labelBox = {
                left:
                  midpoint.x -
                  projectedWidth /
                    2,
                top:
                  midpoint.y -
                  projectedHeight /
                    2,
                right:
                  midpoint.x +
                  projectedWidth /
                    2,
                bottom:
                  midpoint.y +
                  projectedHeight /
                    2,
              };

              if (
                polygonPointCount > 6 &&
                !addPdfLabelBox(
                  labelBox,
                )
              ) {
                return;
              }

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
                distanceLabel,
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

        
        const pdfAreaLabelText =
          displayArea(
            polygon.areaM2,
            "en",
          );

        const pdfAreaLabelX =
          mapX +
          mapWidth / 2;
        const pdfAreaLabelY =
          centredMapY +
          mapHeight / 2;

        pdf.setFont(
          "helvetica",
          "bold",
        );
        pdf.setFontSize(
          10.5,
        );

        pdf.setTextColor(
          15,
          23,
          42,
        );
        pdf.text(
          pdfAreaLabelText,
          pdfAreaLabelX + 0.35,
          pdfAreaLabelY + 0.35,
          {
            align:
              "center",
          },
        );

        pdf.setTextColor(
          255,
          255,
          255,
        );
        pdf.text(
          pdfAreaLabelText,
          pdfAreaLabelX,
          pdfAreaLabelY,
          {
            align:
              "center",
          },
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
        void overlapArea;
        const keyPlanPosition =
          keyPlanCandidates[0];

        await addKeyPlan(
            mapX +
              0.8,
            centredMapY +
              0.8,
            60,
            60,
            planMapImageData,
          );

        addFinalTitleBlock(
          margin +
            mainMapAreaWidth +
            sheetGap,
          mapY,
          titleBlockWidth,
          sheetContentHeight,
        );

        const coordinateTableStartIndex =
          useFullCoordinateTable
            ? 0
            : 5;

        if (
          polygon.coordinates.length >
          coordinateTableStartIndex
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
          0.07,
          0.25,
          0.43,
          0.68,
          0.9,
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
              2,
            {
              align:
                "center",
              baseline:
                "middle",
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
            coordinateTableStartIndex,
          )
          .forEach(
          (
            coordinate,
            index,
          ) => {
            const pointIndex =
              index +
              coordinateTableStartIndex;

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
              formatPdfBearing(
                polygon.segments[
                  pointIndex
                ]?.bearingDecimal,
              ),
              formatPdfDistance(
                polygon.segments[
                  pointIndex
                ]?.distanceM,
              ),
              "",
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
      } catch (error) {
        console.error(
          "SabahLot PDF generation failed",
          error,
        );
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

  const createPreliminaryExportInput =
    () => {
      if (
        !polygon ||
        polygon.coordinates.length < 3
      ) {
        setSaveMessage(
          "Draw, import or load a polygon before exporting.",
        );

        return null;
      }

      return {
        polygon,
        metadata: {
          recordTitle:
            formData.lotNumber.trim() ||
            "SabahLot Preliminary Record",
          village:
            formData.village.trim(),
          district:
            formData.district.trim(),
          generatedAt:
            new Date().toISOString(),
        },
      };
    };

  const exportCurrentPolygonGeoJson =
    () => {
      const input =
        createPreliminaryExportInput();

      if (!input) {
        return;
      }

      const document =
        buildPreliminaryGeoJson(
          input,
        );

      downloadTextFile(
        document.content,
        document.fileName,
        document.mimeType,
      );
      setSaveMessage(
        "GeoJSON preliminary output generated.",
      );
    };

  const exportCurrentPolygonKml =
    () => {
      const input =
        createPreliminaryExportInput();

      if (!input) {
        return;
      }

      const document =
        buildPreliminaryKml(
          input,
        );

      downloadTextFile(
        document.content,
        document.fileName,
        document.mimeType,
      );
      setSaveMessage(
        "KML preliminary output generated.",
      );
    };

  const exportCurrentPolygonCsv =
    () => {
      const input =
        createPreliminaryExportInput();

      if (!input) {
        return;
      }

      const document =
        buildPreliminaryCsv(
          input,
        );

      downloadTextFile(
        document.content,
        document.fileName,
        document.mimeType,
      );
      setSaveMessage(
        "CSV preliminary output generated.",
      );
    };

  const printCurrentPolygonOutput =
    () => {
      const input =
        createPreliminaryExportInput();

      if (!input) {
        return;
      }

      const printWindow =
        window.open(
          "",
          "_blank",
          "noopener,noreferrer",
        );

      if (!printWindow) {
        setSaveMessage(
          "Print window was blocked. Allow pop-ups to print this output.",
        );
        return;
      }

      printWindow.document.open();
      printWindow.document.write(
        buildPreliminaryPrintHtml(
          input,
        ),
      );
      printWindow.document.close();
      printWindow.focus();
      printWindow.setTimeout(
        () => {
          printWindow.print();
        },
        250,
      );
      setSaveMessage(
        "Print / Preliminary PDF output opened.",
      );
    };

  const exportKml =
    () => {
      const lotName =
        formData.lotNumber.trim() ||
        "SabahLot";

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
      const visiblePoints =
        manualPoints.filter(
          (point) =>
            point.isVisible,
        );

      const placemarks =
        [
          ...visiblePoints.map(
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
                  "Object Type",
                  "Point",
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
                [
                  "Generated By",
                  "SabahLot powered by Myukur",
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
                        "Object Type",
                  "Approximate Polygon Boundary",
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
                      [
                        "Estimated Area",
                        `${object.areaSqm.toFixed(2)} m2`,
                      ],
                      [
                        "Generated By",
                        "SabahLot powered by Myukur",
                      ],
                    ]) +
                    `<LineString><tessellate>1</tessellate><coordinates>` +
                    `${coordinates}</coordinates></LineString>` +
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
                      "Object Type",
                      lineKind,
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
                    [
                      "Length",
                      `${object.lengthM.toFixed(2)} m`,
                    ],
                    [
                      "Generated By",
                      "SabahLot powered by Myukur",
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
        buildKmlDocument(
          lotName,
          drawingObjects,
          manualPoints,
        ).content,
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
      const visiblePoints =
        manualPoints.filter(
          (point) =>
            point.isVisible,
        );

      if (
        visibleObjects.length === 0 &&
        visiblePoints.length === 0
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
        visiblePoints
          .map((point) =>
            pointEntity(
              point.coordinate,
              point.pointName.trim() ||
                point.pointCode,
            ),
          )
          .join("");

      // These legacy builders remain local to minimize churn in this phase;
      // the tested utility below is the authoritative downloaded document.
      void layerTable;
      void objectEntities;
      void pointEntities;

      downloadTextFile(
        buildDxfDocument(
          drawingObjects,
          manualPoints,
        ).content,
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

  const handleFieldGpsPolygonGenerated = (
    result: PolygonResult,
  ) => {
    setPolygon(result);
    setLoadedCoordinates(
      result.coordinates,
    );
    setHasUnsavedChanges(true);
    setSaveMessage(
      "Preliminary Field GPS polygon generated. Estimated area only.",
    );
  };

  const parentCloudSyncMessage = (): string | null => {
    switch (parentCloudSync.status) {
      case "idle":
        return null;
      case "saving":
        return text.parentCloudSyncSaving;
      case "core_record_synced":
        return text.parentCloudSyncSynced;
      case "no_session":
        return text.parentCloudSyncNoSession;
      case "invalid_input":
        return text.parentCloudSyncInvalidInput;
      case "duplicate_conflict":
        return text.parentCloudSyncDuplicateConflict;
      case "stale_conflict":
        return text.parentCloudSyncStaleConflict;
      case "failed":
      case "network_error":
        return text.parentCloudSyncFailed;
      case "local_only":
        return parentCloudSync.localOnlyReason === "legacy_id"
          ? text.parentCloudSyncLocalOnlyLegacyId
          : text.parentCloudSyncLocalOnlyGateDisabled;
      default:
        return null;
    }
  };

  const geometryCloudSyncMessage = (): string | null => {
    switch (geometryCloudSync.status) {
      case "idle":
        return null;
      case "saving":
        return text.geometryCloudSyncSaving;
      case "geometry_synced":
        return text.geometryCloudSyncSynced;
      case "local_only":
        return geometryCloudSync.localOnlyReason === "no_parent_geometry"
          ? text.geometryCloudSyncNoParentGeometry
          : text.geometryCloudSyncParentNotSynced;
      case "invalid_input":
      case "duplicate_conflict":
        return text.geometryCloudSyncInvalidInput;
      case "stale_conflict":
        return text.geometryCloudSyncConflict;
      case "failed":
      case "network_error":
        return text.geometryCloudSyncFailed;
      default:
        return null;
    }
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
        initialManualPoints={
          manualPoints
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
        onOpenCategoryDrawer={openCategoryDrawer}
        onLanguageChange={
          setLanguage
        }
        onAreaUnitChange={
          setSelectedAreaUnit
        }
        onMapViewChange={
          setMapView
        }
        fieldGpsControl={
          <FieldGpsLite
            enabled={appMode === "advanced"}
            recordName={
              formData.lotNumber
            }
            offlineMapNote={
              ""
            }
            onPolygonGenerated={
              handleFieldGpsPolygonGenerated
            }
          />
        }
        appMode={appMode}
        region={region}
        onRegionChange={setRegion}
        mapToolsRevealToken={mapToolsRevealToken}
      />

      <CategoryDrawer
        open={categoryDrawerOpen}
        onOpen={openCategoryDrawer}
        onClose={closeCategoryDrawer}
        language={language}
        appMode={appMode}
        onModeChange={setAppMode}
        onSelectCategory={handleSelectCategory}
        suppressHandle={lotPanelOpen}
      />

      <NcrScreen
        open={ncrScreenOpen}
        onClose={() => setNcrScreenOpen(false)}
        language={language}
        polygon={polygon}
        landHistoryNotes={formData.landRecord.landHistoryNotes}
        onLandHistoryNotesChange={(value) =>
          updateLandRecordField("landHistoryNotes", value)
        }
        recordsAvailableCount={
          formData.landRecord.recordsAvailable.filter(
            (item) => item !== "no_record",
          ).length
        }
        onStartRecord={() => {
          updateLandRecordField("landCaseType", "family_customary_land");
          if (!formData.landRecord.issueTags.includes("customary_land_ncr")) {
            toggleIssueTag("customary_land_ncr");
          }
          setNcrScreenOpen(false);
          openLotPanel();
        }}
        onOpenPlansExport={() => {
          setNcrScreenOpen(false);
          openLotPanel();
        }}
        onOpenSupportingEvidence={() => {
          setNcrScreenOpen(false);
          openLotPanel();
        }}
        onRequestReview={() => {
          setNcrScreenOpen(false);
          openFeedback(getAppText(language).modules.ncr.label);
        }}
      />

      <ServiceRequestScreen
        open={serviceRequestOpen}
        onClose={() => setServiceRequestOpen(false)}
        language={language}
        onSendFeedback={() => {
          setServiceRequestOpen(false);
          openFeedback(getAppText(language).modules.service_request.label);
        }}
      />

      <FeedbackModal
        open={feedbackModalOpen}
        onClose={closeFeedback}
        initialValues={{
          fungsiDiuji: feedbackModalModule,
          region,
        }}
      />

      {shellNotice && (
        <div className="sl-shell-toast" role="status">
          {shellNotice}
        </div>
      )}

      <BetaNoticeModal />

      <PublicBetaLabel />

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
            {"\u00d7"}
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

            <p className="sl-alpha-privacy-note">
              Preliminary reference only -- avoid sensitive personal information.
            </p>

            <details className="sl-record-section sl-disclaimer-details">
              <summary>Read more</summary>
              <p className="sl-record-section-hint">
                For Alpha testing, avoid entering highly sensitive personal information.
                {` ${PRELIMINARY_DISCLAIMER}`}
              </p>
            </details>
          </div>

          <form
            className="sl-lot-form"
            onSubmit={
              saveLotRecord
            }
          >
            <details
              className="sl-record-section"
              name="sl-lot-record-accordion"
              open
            >
              <summary>Basic Lot Info</summary>
              <p className="sl-record-section-hint">
                Required -- the core details that identify this record.
              </p>
              <div className="sl-record-section-body">
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

              </div>
            </details>

            <details
              className="sl-record-section"
              name="sl-lot-record-accordion"
            >
              <summary>Land Application Record</summary>
              <p className="sl-record-section-hint">
                Optional -- application status and supporting documents already on hand.
              </p>
              <div className="sl-record-section-body">
                <label>
                  <span>Land case type</span>
                  <select
                    value={formData.landRecord.landCaseType}
                    onChange={(event) =>
                      updateLandRecordField(
                        "landCaseType",
                        event.target.value as LandRecordDetails["landCaseType"],
                      )
                    }
                  >
                    <option value="">Select case type</option>
                    {LAND_CASE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>

                <fieldset className="sl-record-checklist">
                  <legend>Record available</legend>
                  {AVAILABLE_RECORD_OPTIONS.map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={formData.landRecord.recordsAvailable.includes(value)}
                        onChange={() => toggleAvailableRecord(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>

                <label>
                  <span>Application age</span>
                  <select
                    value={formData.landRecord.applicationAge}
                    onChange={(event) =>
                      updateLandRecordField(
                        "applicationAge",
                        event.target.value as LandRecordDetails["applicationAge"],
                      )
                    }
                  >
                    <option value="">Select application age</option>
                    {APPLICATION_AGE_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </details>

            <details
              className="sl-record-section"
              name="sl-lot-record-accordion"
            >
              <summary>Family / Inheritance</summary>
              <p className="sl-record-section-hint">
                Optional -- for inheritance or family customary land cases only.
              </p>
              <div className="sl-record-section-body">
                <label>
                  <span>Original applicant name</span>
                  <input
                    type="text"
                    value={formData.landRecord.originalApplicantName}
                    onChange={(event) => updateLandRecordField("originalApplicantName", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Original applicant status</span>
                  <select
                    value={formData.landRecord.originalApplicantStatus}
                    onChange={(event) => updateLandRecordField(
                      "originalApplicantStatus",
                      event.target.value as LandRecordDetails["originalApplicantStatus"],
                    )}
                  >
                    <option value="">Select status</option>
                    <option value="alive">Alive</option>
                    <option value="deceased">Deceased</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label>
                  <span>Main heir name</span>
                  <input
                    type="text"
                    value={formData.landRecord.mainHeirName}
                    onChange={(event) => updateLandRecordField("mainHeirName", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Relationship to applicant</span>
                  <input
                    type="text"
                    value={formData.landRecord.relationshipToApplicant}
                    onChange={(event) => updateLandRecordField("relationshipToApplicant", event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span>Can heirs identify the land location?</span>
                  <select
                    value={formData.landRecord.heirsCanIdentifyLocation}
                    onChange={(event) => updateLandRecordField(
                      "heirsCanIdentifyLocation",
                      event.target.value as LandRecordDetails["heirsCanIdentifyLocation"],
                    )}
                  >
                    <option value="">Select answer</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                    <option value="not_sure">Not sure</option>
                  </select>
                </label>
                <label>
                  <span>Land history notes</span>
                  <textarea
                    value={formData.landRecord.landHistoryNotes}
                    onChange={(event) => updateLandRecordField("landHistoryNotes", event.target.value)}
                    rows={4}
                  />
                </label>
              </div>
            </details>

            <details
              className="sl-record-section"
              name="sl-lot-record-accordion"
            >
              <summary>Issue Tags</summary>
              <p className="sl-record-section-hint">
                Optional -- flag known issues with this land matter for follow-up.
              </p>
              <div className="sl-record-section-body">
                <fieldset className="sl-record-checklist">
                  <legend>Land issue tags</legend>
                  {ISSUE_TAG_OPTIONS.map(([value, label]) => (
                    <label key={value}>
                      <input
                        type="checkbox"
                        checked={formData.landRecord.issueTags.includes(value)}
                        onChange={() => toggleIssueTag(value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
            </details>

            <details
              className="sl-record-section"
              name="sl-lot-record-accordion"
            >
              <summary>Notes</summary>
              <p className="sl-record-section-hint">
                Optional -- any additional context for this record.
              </p>
              <div className="sl-record-section-body">
                <label>
                  <span>General record notes</span>
                  <textarea
                    value={formData.notes}
                    onChange={(event) => updateField("notes", event.target.value)}
                    rows={4}
                  />
                </label>
              </div>
            </details>

            <div className="sl-record-review">
              <strong>Review</strong>
              <p>
                {formData.lotNumber.trim() || formData.ownerName.trim()
                  ? `${formData.lotNumber.trim() || "(no lot number)"} -- ${formData.ownerName.trim() || "(no owner name)"}`
                  : "Fill in Basic Lot Info above to see a summary here."}
                {polygon
                  ? ` -- ${displayArea(polygon.areaM2)}`
                  : " -- no boundary drawn yet"}
              </p>
              {!canSaveLot && (
                <p className="sl-record-review-blocked">
                  {saveBlockedMessage}
                </p>
              )}
            </div>

            <button
              type="submit"
              className={`sl-save-button ${
                hasUnsavedChanges
                  ? "is-unsaved"
                  : ""
              }`}
              disabled={
                isSaving
              }
              title={
                canSaveLot
                  ? text.save
                  : saveBlockedMessage
              }
            >
              <span aria-hidden="true">
                {"\u2713"}
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

            {parentCloudSyncMessage() && (
              <p
                className={`sl-parent-cloud-sync-message sl-parent-cloud-sync-message--${parentCloudSync.status}`}
                role="status"
              >
                {parentCloudSyncMessage()}
              </p>
            )}

            {geometryCloudSyncMessage() && (
              <p
                className={`sl-parent-cloud-sync-message sl-parent-cloud-sync-message--${geometryCloudSync.status}`}
                role="status"
              >
                {geometryCloudSyncMessage()}
              </p>
            )}
          </form>

          <details
            className="sl-record-section"
            name="sl-lot-utility-accordion"
          >
            <summary>Import Data</summary>
            <p className="sl-record-section-hint">
              Optional -- bring in coordinates from a KML, GeoJSON or CSV file instead of drawing on the map.
            </p>

          <section className="sl-import-panel">
            <div className="sl-summary-heading">
              <span className="sl-eyebrow">
                Private preliminary import
              </span>

              <h2>
                Import Data
              </h2>
            </div>

            <div className="sl-import-controls">
              <label className="sl-import-file">
                <span>
                  Import File
                </span>

                <input
                  type="file"
                  accept=".kml,.geojson,.json,.csv,.dxf,application/vnd.google-earth.kml+xml,application/geo+json,application/json,text/csv"
                  onChange={handleImportFileChange}
                />
              </label>

              <div className="sl-import-actions">
                <button
                  type="button"
                  onClick={previewImportFile}
                  disabled={
                    !importFile ||
                    isPreviewingImport
                  }
                >
                  {isPreviewingImport
                    ? "Previewing..."
                    : "Preview"}
                </button>

                <button
                  type="button"
                  onClick={useImportedGeometry}
                  disabled={
                    !importPreview ||
                    importPreview.kind !==
                      "polygon"
                  }
                >
                  Use Geometry
                </button>

                <button
                  type="button"
                  onClick={useImportedPoint}
                  disabled={
                    !importPreview ||
                    importPreview.kind !==
                      "point"
                  }
                >
                  Add as Field Point
                </button>

                <button
                  type="button"
                  onClick={() =>
                    saveLotRecord()
                  }
                  disabled={
                    isSaving ||
                    !polygon
                  }
                >
                  Save Record
                </button>
              </div>
            </div>

            <div className="sl-import-status">
              <strong>
                {IMPORT_STATUS_LABEL[importStatus]}
              </strong>

              <span>
                {importFile?.name ??
                  "KML, GeoJSON and CSV are supported in this build."}
              </span>
            </div>

            {importPreview && (
              <div className="sl-import-preview">
                <span>
                  {importPreview.format} - {importPreview.kind}
                </span>

                <strong>
                  {importPreview.name}
                </strong>

                <small>
                  {importPreview.pointCount} vertices
                  {importPreview.polygon
                    ? ` - ${displayArea(
                        importPreview.polygon.areaM2,
                      )} - ${formatNumber(
                        importPreview.polygon
                          .perimeterM,
                        language,
                      )} m perimeter`
                    : ""}
                </small>
              </div>
            )}

            {importError && (
              <p className="sl-import-error">
                {importError}
              </p>
            )}

            <p className="sl-import-disclaimer">
              {IMPORT_DISCLAIMER}
            </p>

            <small className="sl-alpha-privacy-note">
              Imported data stays private-by-default on this device unless you explicitly save and sync a record.
            </small>
          </section>
          </details>

          <details
            className="sl-record-section"
            name="sl-lot-utility-accordion"
          >
            <summary>{text.summary}</summary>
            <p className="sl-record-section-hint">
              Drawing summary, exports (PDF/KML/DXF) and output plan options for this record.
            </p>

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

            <div className="sl-preliminary-export-panel">
              <div>
                <span className="sl-output-options-title">
                  Preliminary export
                </span>
                <small>
                  Current polygon only. Includes metadata, estimates and disclaimer.
                </small>
              </div>

              <div className="sl-preliminary-export-actions">
                <button
                  type="button"
                  onClick={
                    exportCurrentPolygonGeoJson
                  }
                  disabled={!polygon}
                >
                  Export GeoJSON
                </button>

                <button
                  type="button"
                  onClick={
                    exportCurrentPolygonKml
                  }
                  disabled={!polygon}
                >
                  Export KML
                </button>

                <button
                  type="button"
                  onClick={
                    exportCurrentPolygonCsv
                  }
                  disabled={!polygon}
                >
                  Export CSV
                </button>

                <button
                  type="button"
                  onClick={
                    printCurrentPolygonOutput
                  }
                  disabled={!polygon}
                >
                  Print / Preliminary PDF
                </button>
              </div>
            </div>

            <div className="sl-output-options">
              <span className="sl-output-options-title">
                Output options
              </span>

              <label>
                <span>
                  Preliminary output format
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
                  Estimated area:{" "}
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
                  : "Generate preliminary output"}
              </span>
            </button>
          </section>
          </details>

          <details
            className="sl-record-section"
            name="sl-lot-utility-accordion"
          >
            <summary>{text.savedLots}</summary>
            <p className="sl-record-section-hint">
              Optional -- browse, reload or manage records you have already saved on this device or account.
            </p>

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
          </details>
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






