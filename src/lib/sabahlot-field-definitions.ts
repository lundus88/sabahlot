export type SabahLotDataType =
  | "string"
  | "number"
  | "date"
  | "boolean"
  | "enum"
  | "file"
  | "geometry"
  | "coordinate"
  | "array";

export type SabahLotPrivacyLevel = "private" | "controlled_share" | "public";
export type SabahLotSensitivityLevel = "low" | "medium" | "high";

export interface SabahLotFieldDefinition {
  fieldKey: string;
  labelBM: string;
  labelEN?: string;
  dataType: SabahLotDataType;
  required: boolean;
  moduleOwner: string;
  privacyLevel: SabahLotPrivacyLevel;
  sensitivityLevel: SabahLotSensitivityLevel;
  validationRule: string;
  helpText: string;
  complianceNote: string;
  preliminaryDisclaimerRequired: boolean;
  manualReviewRequired: boolean;
}

export const SABAHLOT_FIELD_DEFINITIONS: SabahLotFieldDefinition[] = [
  {
    fieldKey: "lot.recordName",
    labelBM: "Nama rekod tanah",
    labelEN: "Land record name",
    dataType: "string",
    required: true,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Required before save/export.",
    helpText: "Nama mudah untuk pengguna kenal rekod ini.",
    complianceNote: "Bukan nama rasmi hakmilik kecuali disahkan oleh dokumen rasmi.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "lot.district",
    labelBM: "Daerah",
    labelEN: "District",
    dataType: "string",
    required: true,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Required for organized record.",
    helpText: "Contoh: Kota Marudu, Tuaran, Lahad Datu.",
    complianceNote: "Daerah membantu susunan rekod tetapi bukan carian rasmi.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "lot.village",
    labelBM: "Mukim / kampung",
    labelEN: "Mukim / village",
    dataType: "string",
    required: false,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Optional text.",
    helpText: "Masukkan kampung atau mukim jika diketahui.",
    complianceNote: "Perlu semakan rasmi jika digunakan dalam urusan pihak berkuasa.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "lot.landCaseType",
    labelBM: "Jenis tanah / urusan",
    labelEN: "Land case type",
    dataType: "enum",
    required: false,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Must match SabahLot land case enum.",
    helpText: "NT/CL/NCR/belum pasti perlu direkod sebagai status pengetahuan pengguna.",
    complianceNote: "Jangan tafsir sebagai pengesahan jenis hakmilik rasmi.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: true,
  },
  {
    fieldKey: "lot.lotNumber",
    labelBM: "Nombor lot",
    labelEN: "Lot number",
    dataType: "string",
    required: false,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Optional text.",
    helpText: "Isi jika ada pada dokumen pengguna.",
    complianceNote: "No. lot tidak menggantikan carian rasmi.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "lot.titleNumber",
    labelBM: "Nombor hakmilik / title number",
    labelEN: "Title number",
    dataType: "string",
    required: false,
    moduleOwner: "land-record-organizer",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "Optional text, default private.",
    helpText: "Maklumat sensitif. Simpan hanya jika perlu.",
    complianceNote: "Bukan carian hakmilik rasmi tanpa integrasi sah.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: true,
  },
  {
    fieldKey: "location.polygon",
    labelBM: "Polygon",
    labelEN: "Polygon",
    dataType: "geometry",
    required: true,
    moduleOwner: "gis-mapping",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "At least 3 coordinates or imported polygon.",
    helpText: "Polygon ialah bentuk kawasan tanah yang dilukis di peta.",
    complianceNote: "Bukan pengesahan sempadan sah.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "location.point",
    labelBM: "Point marker",
    labelEN: "Point marker",
    dataType: "coordinate",
    required: false,
    moduleOwner: "gis-mapping",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "Latitude/longitude numeric values.",
    helpText: "Pin lokasi untuk rujukan awal jika polygon belum lengkap.",
    complianceNote: "Phone GPS dan koordinat manual adalah anggaran.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "location.importFile",
    labelBM: "KML / GeoJSON / CSV koordinat",
    labelEN: "KML / GeoJSON / coordinate CSV",
    dataType: "file",
    required: false,
    moduleOwner: "gis-import",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "Supported file type only.",
    helpText: "Import data untuk rujukan preliminary.",
    complianceNote: "Sumber dan CRS perlu disemak sebelum kegunaan rasmi.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "location.coordinateSystem",
    labelBM: "Sistem koordinat",
    labelEN: "Coordinate system",
    dataType: "enum",
    required: false,
    moduleOwner: "gis-mapping",
    privacyLevel: "private",
    sensitivityLevel: "medium",
    validationRule: "WGS84, RSO Borneo placeholder, or unknown.",
    helpText: "Pilih WGS84 jika data dari GPS/KML biasa. RSO Borneo untuk fasa profesional.",
    complianceNote: "Tiada transformasi rasmi dibuat dalam Alpha.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: true,
  },
  {
    fieldKey: "document.documentType",
    labelBM: "Jenis dokumen",
    labelEN: "Document type",
    dataType: "enum",
    required: false,
    moduleOwner: "document-locker",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "Must match supported document type.",
    helpText: "Contoh: geran, surat JTU, gambar tapak, dokumen waris.",
    complianceNote: "Dokumen sensitif default private.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "document.fileName",
    labelBM: "Nama fail",
    labelEN: "File name",
    dataType: "string",
    required: false,
    moduleOwner: "document-locker",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "Captured from selected file metadata.",
    helpText: "SabahLot Alpha menyimpan metadata dokumen, bukan pengesahan rasmi.",
    complianceNote: "Jangan jadikan fail public secara default.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: false,
  },
  {
    fieldKey: "issue.issueTags",
    labelBM: "Isu tanah",
    labelEN: "Land issue tags",
    dataType: "array",
    required: false,
    moduleOwner: "risk-review",
    privacyLevel: "private",
    sensitivityLevel: "high",
    validationRule: "Must match issue tag registry.",
    helpText: "Tanda isu seperti sempadan tidak jelas, dokumen tidak lengkap atau NCR.",
    complianceNote: "SabahLot hanya beri amaran awal, bukan keputusan undang-undang.",
    preliminaryDisclaimerRequired: true,
    manualReviewRequired: true,
  },
];
