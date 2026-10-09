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
  activateAccountLocalStorage,
} from "@/lib/account-local-storage";
import {
  buildDxfDocument,
  buildKmlDocument,
  DXF_CRS_NOTICE,
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
  type ApplicantStatus,
  type HeirLocationKnowledge,
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
import type {
  FieldGpsPoint,
} from "@/lib/field-gps.types";

import {
  syncParentGeometryToCloud,
  syncParentLandRecordToCloud,
  type CloudDocumentType,
  type CloudPartyRole,
 ¶»§q«^