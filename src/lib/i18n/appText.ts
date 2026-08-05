import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";

export type ModuleId =
  | "ncr"
  | "land_management"
  | "map_drawing"
  | "field_work"
  | "plans_export"
  | "service_request"
  | "help_guide"
  | "feedback"
  | "advanced_mode";

export const MODULE_ORDER: readonly ModuleId[] = [
  "ncr",
  "land_management",
  "map_drawing",
  "field_work",
  "plans_export",
  "service_request",
  "help_guide",
  "feedback",
  "advanced_mode",
];

interface ModuleText {
  label: string;
  description: string;
}

interface AppTextShape {
  brand: string;
  menuButton: string;
  searchPlaceholder: string;
  controlledBetaBadge: string;
  regionPickerTitle: string;
  languagePickerTitle: string;
  modules: Record<ModuleId, ModuleText>;
  modeToggle: {
    publicLabel: string;
    publicDescription: string;
    advancedLabel: string;
    advancedDescription: string;
  };
  fieldWorkPublicNudge: string;
  ncrScreen: {
    title: string;
    subtitle: string;
    startRecord: string;
    searchLocation: string;
    drawArea: string;
    landUseHistory: string;
    supportingEvidence: string;
    estimatedArea: string;
    generateRecord: string;
    requestReview: string;
    close: string;
  };
  serviceRequest: {
    title: string;
    body: string;
    cta: string;
    close: string;
  };
  helpGuide: {
    openManual: string;
  };
}

export const APP_TEXT: Record<AppLanguage, AppTextShape> = {
  en: {
    brand: "SabahLot Alpha",
    menuButton: "Open menu",
    searchPlaceholder: "Search land location / coordinate",
    controlledBetaBadge: "Controlled Alpha",
    regionPickerTitle: "Region",
    languagePickerTitle: "Language",
    modules: {
      ncr: {
        label: "NCR / Native Customary Land",
        description: "Native customary land records and boundary claims",
      },
      land_management: {
        label: "Land Management",
        description: "Lot records, applications, and family/inheritance details",
      },
      map_drawing: {
        label: "Map & Drawing",
        description: "Draw, edit, and manage boundaries on the map",
      },
      field_work: {
        label: "Field Work",
        description: "GPS tracking, point finding, and AR stakeout",
      },
      plans_export: {
        label: "Plans & Export",
        description: "Generate PDF plans and export KML/DXF",
      },
      service_request: {
        label: "Service Request",
        description: "Request assistance from a land officer or surveyor",
      },
      help_guide: {
        label: "Help & Guide",
        description: "User manual and how-to guides",
      },
      feedback: {
        label: "Feedback",
        description: "Report an issue or share feedback",
      },
      advanced_mode: {
        label: "Advanced / Surveyor Mode",
        description: "Show technical survey tools",
      },
    },
    modeToggle: {
      publicLabel: "Public Mode",
      publicDescription: "Simplified view for landowners",
      advancedLabel: "Advanced / Surveyor Mode",
      advancedDescription: "Full technical survey tools",
    },
    fieldWorkPublicNudge:
      "Field GPS tools are available in Advanced / Surveyor Mode.",
    ncrScreen: {
      title: "NCR / Native Customary Land",
      subtitle: "Preliminary reference tools for native customary land records",
      startRecord: "Start NCR Record",
      searchLocation: "Search Land Location",
      drawArea: "Draw NCR Area",
      landUseHistory: "Land Use History",
      supportingEvidence: "Supporting Evidence",
      estimatedArea: "Estimated Area",
      generateRecord: "Generate NCR Preliminary Record",
      requestReview: "Request Review Assistance",
      close: "Close",
    },
    serviceRequest: {
      title: "Service Request",
      body: "Direct requests to your local land office are coming in a later phase. For now, tell us what you need and we'll follow up.",
      cta: "Send Feedback",
      close: "Close",
    },
    helpGuide: {
      openManual: "Open User Manual",
    },
  },
  ms: {
    brand: "SabahLot Alpha",
    menuButton: "Buka menu",
    searchPlaceholder: "Cari lokasi tanah / koordinat",
    controlledBetaBadge: "Alpha Terkawal",
    regionPickerTitle: "Wilayah",
    languagePickerTitle: "Bahasa",
    modules: {
      ncr: {
        label: "NCR / Tanah Adat",
        description: "Rekod tanah adat dan tuntutan sempadan",
      },
      land_management: {
        label: "Pengurusan Tanah",
        description: "Rekod lot, permohonan, dan butiran keluarga/pusaka",
      },
      map_drawing: {
        label: "Peta & Lukisan",
        description: "Lukis, edit, dan urus sempadan pada peta",
      },
      field_work: {
        label: "Kerja Lapangan",
        description: "Penjejakan GPS, cari titik, dan panduan AR",
      },
      plans_export: {
        label: "Pelan & Eksport",
        description: "Jana pelan PDF dan eksport KML/DXF",
      },
      service_request: {
        label: "Permohonan Perkhidmatan",
        description: "Mohon bantuan daripada pegawai tanah atau juruukur",
      },
      help_guide: {
        label: "Bantuan & Panduan",
        description: "Manual pengguna dan panduan",
      },
      feedback: {
        label: "Maklum Balas",
        description: "Laporkan isu atau kongsi maklum balas",
      },
      advanced_mode: {
        label: "Mod Lanjutan / Juruukur",
        description: "Tunjukkan alat ukur teknikal",
      },
    },
    modeToggle: {
      publicLabel: "Mod Awam",
      publicDescription: "Paparan ringkas untuk pemilik tanah",
      advancedLabel: "Mod Lanjutan / Juruukur",
      advancedDescription: "Alat ukur teknikal penuh",
    },
    fieldWorkPublicNudge:
      "Alat GPS lapangan tersedia dalam Mod Lanjutan / Juruukur.",
    ncrScreen: {
      title: "NCR / Tanah Adat",
      subtitle: "Alat rujukan awal untuk rekod tanah adat",
      startRecord: "Mulakan Rekod NCR",
      searchLocation: "Cari Lokasi Tanah",
      drawArea: "Lukis Kawasan NCR",
      landUseHistory: "Sejarah Penggunaan Tanah",
      supportingEvidence: "Bukti Sokongan",
      estimatedArea: "Anggaran Keluasan",
      generateRecord: "Jana Rekod Awal NCR",
      requestReview: "Mohon Bantuan Semakan",
      close: "Tutup",
    },
    serviceRequest: {
      title: "Permohonan Perkhidmatan",
      body: "Permohonan terus kepada pejabat tanah anda akan tersedia pada fasa akan datang. Buat masa ini, beritahu kami keperluan anda dan kami akan hubungi semula.",
      cta: "Hantar Maklum Balas",
      close: "Tutup",
    },
    helpGuide: {
      openManual: "Buka Manual Pengguna",
    },
  },
  zh: {
    brand: "SabahLot Alpha",
    menuButton: "打开菜单",
    searchPlaceholder: "搜索地块位置 / 坐标",
    controlledBetaBadge: "受控内测版",
    regionPickerTitle: "地区",
    languagePickerTitle: "语言",
    modules: {
      ncr: {
        label: "NCR / 原住民习惯地",
        description: "原住民习惯地记录与边界申请",
      },
      land_management: {
        label: "土地管理",
        description: "地块记录、申请及家族/继承详情",
      },
      map_drawing: {
        label: "地图与绘图",
        description: "在地图上绘制、编辑和管理边界",
      },
      field_work: {
        label: "实地工作",
        description: "GPS追踪、寻点与AR放样",
      },
      plans_export: {
        label: "图纸与导出",
        description: "生成PDF图纸并导出KML/DXF",
      },
      service_request: {
        label: "服务申请",
        description: "向土地官员或测量员申请协助",
      },
      help_guide: {
        label: "帮助与指南",
        description: "用户手册与操作指南",
      },
      feedback: {
        label: "反馈",
        description: "报告问题或分享反馈",
      },
      advanced_mode: {
        label: "高级/测量员模式",
        description: "显示专业测量工具",
      },
    },
    modeToggle: {
      publicLabel: "公众模式",
      publicDescription: "面向地主的简化视图",
      advancedLabel: "高级/测量员模式",
      advancedDescription: "完整专业测量工具",
    },
    fieldWorkPublicNudge: "实地GPS工具仅在高级/测量员模式下可用。",
    ncrScreen: {
      title: "NCR / 原住民习惯地",
      subtitle: "原住民习惯地记录的初步参考工具",
      startRecord: "开始NCR记录",
      searchLocation: "搜索地块位置",
      drawArea: "绘制NCR范围",
      landUseHistory: "土地使用历史",
      supportingEvidence: "佐证材料",
      estimatedArea: "估计面积",
      generateRecord: "生成NCR初步记录",
      requestReview: "申请审核协助",
      close: "关闭",
    },
    serviceRequest: {
      title: "服务申请",
      body: "直接向您当地土地局提交申请的功能将在后续阶段推出。目前请告诉我们您的需求,我们会跟进联系。",
      cta: "发送反馈",
      close: "关闭",
    },
    helpGuide: {
      openManual: "打开用户手册",
    },
  },
};

export function getAppText(language: AppLanguage): AppTextShape {
  return APP_TEXT[language];
}
