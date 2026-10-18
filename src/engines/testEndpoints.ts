import { CLOUDFLARE_HOST, DEFAULT_SERVER_ID } from '../config/defaults';

export interface TestEndpoints {
  ping: string;
  download: string;
  upload: string;
}

export interface SpeedTestServer {
  id: string;
  hostname: string;
  name: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  continent: string;
}

// Cloudflare speed test servers by region
const CLOUDFLARE_SPEED_SERVERS: SpeedTestServer[] = [
  // Africa
  {
    id: 'jnb',
    hostname: 'speed.cloudflare.com',
    name: 'Johannesburg',
    country: 'ZA',
    city: 'Johannesburg',
    latitude: -26.2041,
    longitude: 28.0473,
    continent: 'AF',
  },
  {
    id: 'cpt',
    hostname: 'speed.cloudflare.com',
    name: 'Cape Town',
    country: 'ZA',
    city: 'Cape Town',
    latitude: -33.9249,
    longitude: 18.4241,
    continent: 'AF',
  },
  {
    id: 'nbo',
    hostname: 'speed.cloudflare.com',
    name: 'Nairobi',
    country: 'KE',
    city: 'Nairobi',
    latitude: -1.2921,
    longitude: 36.8219,
    continent: 'AF',
  },
  {
    id: 'lag',
    hostname: 'speed.cloudflare.com',
    name: 'Lagos',
    country: 'NG',
    city: 'Lagos',
    latitude: 6.5244,
    longitude: 3.3792,
    continent: 'AF',
  },
  // Europe
  {
    id: 'lon',
    hostname: 'speed.cloudflare.com',
    name: 'London',
    country: 'GB',
    city: 'London',
    latitude: 51.5074,
    longitude: -0.1278,
    continent: 'EU',
  },
  {
    id: 'ams',
    hostname: 'speed.cloudflare.com',
    name: 'Amsterdam',
    country: 'NL',
    city: 'Amsterdam',
    latitude: 52.3676,
    longitude: 4.9041,
    continent: 'EU',
  },
  {
    id: 'fra',
    hostname: 'speed.cloudflare.com',
    name: 'Frankfurt',
    country: 'DE',
    city: 'Frankfurt',
    latitude: 50.1109,
    longitude: 8.6821,
    continent: 'EU',
  },
  // North America
  {
    id: 'nyc',
    hostname: 'speed.cloudflare.com',
    name: 'New York',
    country: 'US',
    city: 'New York',
    latitude: 40.7128,
    longitude: -74.006,
    continent: 'NA',
  },
  {
    id: 'lax',
    hostname: 'speed.cloudflare.com',
    name: 'Los Angeles',
    country: 'US',
    city: 'Los Angeles',
    latitude: 34.0522,
    longitude: -118.2437,
    continent: 'NA',
  },
  // Asia
  {
    id: 'sin',
    hostname: 'speed.cloudflare.com',
    name: 'Singapore',
    country: 'SG',
    city: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    continent: 'AS',
  },
  {
    id: 'hkg',
    hostname: 'speed.cloudflare.com',
    name: 'Hong Kong',
    country: 'HK',
    city: 'Hong Kong',
    latitude: 22.3193,
    longitude: 114.1694,
    continent: 'AS',
  },
  {
    id: 'del',
    hostname: 'speed.cloudflare.com',
    name: 'Mumbai',
    country: 'IN',
    city: 'Mumbai',
    latitude: 19.076,
    longitude: 72.8777,
    continent: 'AS',
  },
  // South America
  {
    id: 'gru',
    hostname: 'speed.cloudflare.com',
    name: 'Sao Paulo',
    country: 'BR',
    city: 'Sao Paulo',
    latitude: -23.5505,
    longitude: -46.6333,
    continent: 'SA',
  },
  // Oceania
  {
    id: 'syd',
    hostname: 'speed.cloudflare.com',
    name: 'Sydney',
    country: 'AU',
    city: 'Sydney',
    latitude: -33.8688,
    longitude: 151.2093,
    continent: 'OC',
  },
];

export interface AndroidNativeBridge {
  getWifiSsid(): string;
  getWifiBssid?(): string;
  getLocalIpAddress?(): string;
  getGatewayAddress?(): string;
  getWifiSignalDbm?(): number;
  getWifiFrequencyMhz?(): number;
  lookupAccessPointVendor?(oui: string): void;
  getNetworkType(): string;
  hasValidatedInternet?(): boolean;
  hasWifiNamePermission(): boolean;
  isLocationEnabled(): boolean;
  requestWifiNameAccess(): void;
  openLocationSettings(): void;
  openApplicationSettings(): void;
  scanWifiNetworks(): boolean;
  runNativePing?(host: string, count: number, payloadSize: number, requestId: string): boolean;
  saveFile(filename: string, mimeType: string, content: string, base64Encoded: boolean): boolean;
  shareFile?(filename: string, mimeType: string, content: string, base64Encoded: boolean): boolean;
}

export interface RequestTimeout {
  signal: AbortSignal;
  didTimeout: () => boolean;
  dispose: () => void;
}

export function createRequestTimeout(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): RequestTimeout {
  const controller = new AbortController();
  let timedOut = false;
  const onParentAbort = () => controller.abort();

  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', onParentAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    dispose: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener('abort', onParentAbort);
    },
  };
}

export function getAndroidNativeBridge(): AndroidNativeBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { AndroidNative?: AndroidNativeBridge }).AndroidNative;
}

export function isAndroidNativeApp(): boolean {
  return Boolean(getAndroidNativeBridge());
}

export function getAndroidFeatureState() {
  const bridge = getAndroidNativeBridge();

  if (!bridge) {
    return {
      isNativeApp: false,
      hasPermission: false,
      locationEnabled: false,
      canRequestAccess: false,
      canShowWifiScanner: false,
      canRunNativePing: false,
    };
  }

  const hasPermission = typeof bridge.hasWifiNamePermission === 'function'
    ? bridge.hasWifiNamePermission()
    : false;
  const locationEnabled = typeof bridge.isLocationEnabled === 'function'
    ? bridge.isLocationEnabled()
    : false;

  return {
    isNativeApp: true,
    hasPermission,
    locationEnabled,
    canRequestAccess: !hasPermission || !locationEnabled,
    canShowWifiScanner: hasPermission && locationEnabled && typeof bridge.scanWifiNetworks === 'function',
    canRunNativePing: typeof bridge.runNativePing === 'function',
  };
}

/**
 * Get all available speed test servers
 */
export function getSpeedTestServers(): SpeedTestServer[] {
  return [...CLOUDFLARE_SPEED_SERVERS];
}

/**
 * Get a specific server by ID
 */
export function getServerById(id: string): SpeedTestServer | undefined {
  return CLOUDFLARE_SPEED_SERVERS.find((s) => s.id === id);
}

/**
 * Resolve the server selection, including the global AUTO default.
 * If a user or environment has no explicit preference, prefer a neutral non-Africa fallback.
 */
export function resolveServerSelection(serverId?: string): SpeedTestServer {
  const requestedId = (serverId || DEFAULT_SERVER_ID || '').trim().toLowerCase();

  if (!requestedId || requestedId === 'auto') {
    const timezone =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || ''
        : '';

    const regionHints = [
      { match: /(America|Canada|US|Mexico|Brazil)/i, id: 'lax' },
      { match: /(Europe|London|Paris|Berlin|Frankfurt|Amsterdam|Rome|Madrid|Zurich)/i, id: 'fra' },
      { match: /(Asia|Singapore|Tokyo|Seoul|Hong|India|Mumbai|Delhi|Korea|China|Japan|Sydney)/i, id: 'sin' },
      { match: /(Australia|New Zealand|Pacific)/i, id: 'syd' },
    ];

    const inferredId = regionHints.find(({ match }) => match.test(timezone))?.id;
    return getServerById(inferredId || 'fra') || CLOUDFLARE_SPEED_SERVERS[0];
  }

  return getServerById(requestedId) || getServerById('fra') || CLOUDFLARE_SPEED_SERVERS[0];
}

/**
 * Get the default server (auto-selected based on user location or a neutral fallback)
 */
export function getDefaultServer(): SpeedTestServer {
  return resolveServerSelection(DEFAULT_SERVER_ID);
}

/**
 * Get test endpoints for a specific server
 */
export function getTestEndpointsForServer(serverId: string): TestEndpoints {
  const server = serverId === 'auto' ? resolveServerSelection(serverId) : getServerById(serverId);
  const hostname = server?.hostname || CLOUDFLARE_HOST;
  const origin = `https://${hostname}`;
  
  return {
    ping: `${origin}/__down?bytes=1`,
    download: `${origin}/__down`,
    upload: `${origin}/__up`,
  };
}

export function getDefaultTestEndpoints(): TestEndpoints {
  return getTestEndpointsForServer(DEFAULT_SERVER_ID);
}

export function createDownloadTestUrl(
  targetUrl: string,
  sizeBytes: number,
  extraParams: Record<string, string> = {}
): string {
  const baseUrl =
    typeof window === 'undefined'
      ? 'https://example.com'
      : window.location.origin || 'https://example.com';
  const url = new URL(targetUrl, baseUrl);
  const sizeParameter =
    url.hostname === CLOUDFLARE_HOST && url.pathname === '/__down'
      ? 'bytes'
      : 'size';

  url.searchParams.set(sizeParameter, String(sizeBytes));
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

/**
 * Resolve server ID from hostname or return default
 */
export function getServerIdFromHostname(hostname: string): string {
  const server = CLOUDFLARE_SPEED_SERVERS.find(
    (s) => s.hostname === hostname || new URL(s.hostname).hostname === new URL(hostname).hostname
  );
  return server?.id || resolveServerSelection(DEFAULT_SERVER_ID).id;
}
