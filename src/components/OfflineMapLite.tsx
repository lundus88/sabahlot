"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  cacheTileUrls,
  clearOfflineTileCache,
  getOfflineCacheStatus,
  getTileUrlsForBounds,
  isOfflineMapSupported,
  type OfflineMapView,
} from "@/lib/offline-map-cache";

interface OfflineMapLiteProps {
  mapView: OfflineMapView | null;
  enabled: boolean;
  onOfflineNoteChange?: (note: string) => void;
}

export default function OfflineMapLite({
  mapView,
  enabled,
  onOfflineNoteChange,
}: OfflineMapLiteProps) {
  const [
    open,
    setOpen,
  ] = useState(false);
  const [
    online,
    setOnline,
  ] = useState(true);
  const [
    cachedTiles,
    setCachedTiles,
  ] = useState(0);
  const [
    progress,
    setProgress,
  ] = useState({
    cached: 0,
    total: 0,
  });
  const [
    message,
    setMessage,
  ] = useState("");
  const [
    preparing,
    setPreparing,
  ] = useState(false);

  const supported =
    isOfflineMapSupported();

  const tileUrls =
    useMemo(
      () => {
        if (!mapView) {
          return [];
        }

        return getTileUrlsForBounds(
          mapView.bounds,
          [
            mapView.zoom,
            Math.min(
              mapView.zoom + 1,
              20,
            ),
          ],
          mapView.tileUrlTemplate,
          mapView.subdomains,
        ).slice(0, 220);
      },
      [mapView],
    );

  useEffect(() => {
    const updateOnline = () =>
      setOnline(navigator.onLine);

    updateOnline();
    window.addEventListener(
      "online",
      updateOnline,
    );
    window.addEventListener(
      "offline",
      updateOnline,
    );

    return () => {
      window.removeEventListener(
        "online",
        updateOnline,
      );
      window.removeEventListener(
        "offline",
        updateOnline,
      );
    };
  }, []);

  useEffect(() => {
    void getOfflineCacheStatus().then(
      (status) => {
        setCachedTiles(
          status.cachedTiles,
        );
        onOfflineNoteChange?.(
          status.cachedTiles > 0
            ? `${status.cachedTiles} prepared map tiles cached for field reference only.`
            : "",
        );
      },
    );
  }, [onOfflineNoteChange]);

  if (!enabled) {
    return null;
  }

  const prepareOfflineMap = async () => {
    if (!mapView) {
      setMessage(
        "Map view is not ready.",
      );
      return;
    }

    setPreparing(true);
    setProgress({
      cached: 0,
      total:
        tileUrls.length,
    });
    const result =
      await cacheTileUrls(
        tileUrls,
        (cached, total) =>
          setProgress({
            cached,
            total,
          }),
      );
    const status =
      await getOfflineCacheStatus();

    setCachedTiles(
      status.cachedTiles,
    );
    setMessage(
      `${result.cached} / ${result.total} visible-area tiles prepared.`,
    );
    onOfflineNoteChange?.(
      `${status.cachedTiles} prepared map tiles cached for field reference only. Offline map tiles may be incomplete.`,
    );
    setPreparing(false);
  };

  const clearCache = async () => {
    await clearOfflineTileCache();
    setCachedTiles(0);
    setProgress({
      cached: 0,
      total: 0,
    });
    setMessage(
      "Offline map cache cleared.",
    );
    onOfflineNoteChange?.("");
  };

  return (
    <section className="sl-field-gps-panel sl-offline-map-panel">
      <button
        type="button"
        className="sl-field-gps-toggle"
        onClick={() =>
          setOpen(
            (current) => !current,
          )
        }
      >
        Offline Map
      </button>

      {open && (
        <div className="sl-field-gps-card">
          <div className="sl-field-gps-heading">
            <span>Offline Map Lite</span>
            <strong>
              {online
                ? "Online"
                : "Offline"}
            </strong>
          </div>

          {!online && (
            <p className="sl-field-gps-warning">
              Map tile not available offline. Prepare this area while online.
            </p>
          )}

          {!supported && (
            <p className="sl-field-gps-warning">
              Offline map cache is not supported in this browser.
            </p>
          )}

          <div className="sl-field-gps-grid">
            <span>Prepared tiles</span>
            <strong>{cachedTiles}</strong>
            <span>Visible-area tiles</span>
            <strong>{tileUrls.length}</strong>
            <span>Progress</span>
            <strong>
              {progress.cached} / {progress.total}
            </strong>
          </div>

          <div className="sl-field-gps-actions">
            <button
              type="button"
              onClick={prepareOfflineMap}
              disabled={
                !supported ||
                !online ||
                preparing ||
                tileUrls.length === 0
              }
            >
              {preparing
                ? "Preparing..."
                : "Prepare Offline Map"}
            </button>
            <button
              type="button"
              onClick={clearCache}
              disabled={!supported}
            >
              Clear Offline Map Cache
            </button>
          </div>

          {message && (
            <p className="sl-field-gps-note">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
