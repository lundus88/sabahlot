export interface OfflineMapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface OfflineMapView {
  bounds: OfflineMapBounds;
  zoom: number;
  tileUrlTemplate: string;
  subdomains?: string[];
}

export interface OfflineMapCacheStatus {
  supported: boolean;
  cachedTiles: number;
  cacheName: string;
}

export interface OfflineMapTileUrl {
  url: string;
  x: number;
  y: number;
  z: number;
}

export const OFFLINE_TILE_CACHE_NAME =
  "sabahlot-offline-map-lite-v1";

function longitudeToTileX(
  longitude: number,
  zoom: number,
): number {
  return Math.floor(
    ((longitude + 180) / 360) *
      2 ** zoom,
  );
}

function latitudeToTileY(
  latitude: number,
  zoom: number,
): number {
  const latitudeRadians =
    (latitude * Math.PI) / 180;

  return Math.floor(
    ((1 -
      Math.log(
        Math.tan(latitudeRadians) +
          1 /
            Math.cos(
              latitudeRadians,
            ),
      ) /
        Math.PI) /
      2) *
      2 ** zoom,
  );
}

function tileUrl(
  template: string,
  x: number,
  y: number,
  z: number,
  subdomain: string,
): string {
  return template
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{z}", String(z))
    .replace("{s}", subdomain)
    .replace("{r}", "");
}

export function isOfflineMapSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "caches" in window &&
    typeof fetch === "function"
  );
}

export function getTileUrlsForBounds(
  bounds: OfflineMapBounds,
  zoomLevels: number[],
  tileUrlTemplate: string,
  subdomains: string[] = ["a"],
): OfflineMapTileUrl[] {
  const urls: OfflineMapTileUrl[] = [];

  zoomLevels.forEach(
    (zoom) => {
      const westX =
        longitudeToTileX(
          bounds.west,
          zoom,
        );
      const eastX =
        longitudeToTileX(
          bounds.east,
          zoom,
        );
      const northY =
        latitudeToTileY(
          bounds.north,
          zoom,
        );
      const southY =
        latitudeToTileY(
          bounds.south,
          zoom,
        );
      const minX =
        Math.max(
          0,
          Math.min(
            westX,
            eastX,
          ),
        );
      const maxX =
        Math.min(
          2 ** zoom - 1,
          Math.max(
            westX,
            eastX,
          ),
        );
      const minY =
        Math.max(
          0,
          Math.min(
            northY,
            southY,
          ),
        );
      const maxY =
        Math.min(
          2 ** zoom - 1,
          Math.max(
            northY,
            southY,
          ),
        );

      for (
        let x = minX;
        x <= maxX;
        x += 1
      ) {
        for (
          let y = minY;
          y <= maxY;
          y += 1
        ) {
          urls.push({
            url:
              tileUrl(
                tileUrlTemplate,
                x,
                y,
                zoom,
                subdomains[
                  (x + y) %
                    subdomains.length
                ],
              ),
            x,
            y,
            z: zoom,
          });
        }
      }
    },
  );

  return urls;
}

export async function cacheTileUrls(
  tileUrls: OfflineMapTileUrl[],
  onProgress?: (
    cached: number,
    total: number,
  ) => void,
): Promise<{
  cached: number;
  total: number;
}> {
  if (!isOfflineMapSupported()) {
    return {
      cached: 0,
      total:
        tileUrls.length,
    };
  }

  const cache =
    await caches.open(
      OFFLINE_TILE_CACHE_NAME,
    );
  let cached = 0;

  for (const tile of tileUrls) {
    try {
      const response =
        await fetch(tile.url, {
          mode:
            "cors",
          credentials:
            "omit",
        });

      if (response.ok) {
        await cache.put(
          tile.url,
          response.clone(),
        );
        cached += 1;
      }
    } catch {
      // Individual tile failures are expected on weak field networks.
    }

    onProgress?.(
      cached,
      tileUrls.length,
    );
  }

  return {
    cached,
    total:
      tileUrls.length,
  };
}

export async function clearOfflineTileCache(): Promise<void> {
  if (!isOfflineMapSupported()) {
    return;
  }

  await caches.delete(
    OFFLINE_TILE_CACHE_NAME,
  );
}

export async function getOfflineCacheStatus(): Promise<OfflineMapCacheStatus> {
  if (!isOfflineMapSupported()) {
    return {
      supported: false,
      cachedTiles: 0,
      cacheName:
        OFFLINE_TILE_CACHE_NAME,
    };
  }

  const cache =
    await caches.open(
      OFFLINE_TILE_CACHE_NAME,
    );
  const keys =
    await cache.keys();

  return {
    supported: true,
    cachedTiles:
      keys.length,
    cacheName:
      OFFLINE_TILE_CACHE_NAME,
  };
}
