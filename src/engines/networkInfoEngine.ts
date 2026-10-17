/**
 * SpeedXpat — Network Information & Diagnostics Adapter
 * Compliant with SPEEDXPAT_SPEC.md Section 5.2, 5.10, 5.11
 *
 * Inspects device network status via standard Network Information API,
 * accurately labels limitations, and never fakes unsupported hardware metrics.
 */

import { DeviceNetworkInfo, NetworkType } from '../types/network';
import {
  createRequestTimeout,
  getAndroidNativeBridge,
  isAndroidNativeApp,
} from './testEndpoints';
import { getIPInfoFromRadar, CloudflareRadarConfig } from '../services/cloudflareRadarService';

interface NetworkInformationNavigator extends Navigator {
  connection?: {
    type?: string;
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
    saveData?: boolean;
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
}

export async function detectInternetAccess(): Promise<boolean> {
  const androidNative = getAndroidNativeBridge();
  if (androidNative?.hasValidatedInternet) {
    try {
      return androidNative.hasValidatedInternet();
    } catch {
      return false;
    }
  }

  if (!navigator.onLine) return false;
  if (isAndroidNativeApp()) return navigator.onLine;

  const requestTimeout = createRequestTimeout(undefined, 2_500);
  try {
    const response = await fetch('/api/ping', {
      cache: 'no-store',
      signal: requestTimeout.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    requestTimeout.dispose();
  }
}

export async function detectNetworkInfo(
  onInternetAccessDetected?: (isOnline: boolean) => void
): Promise<DeviceNetworkInfo> {
  const online = await detectInternetAccess();
  onInternetAccessDetected?.(online);

  const nav = navigator as NetworkInformationNavigator;
  const conn = nav.connection;

  let networkType: NetworkType = 'unknown';
  let effectiveType: string | undefined = undefined;
  let downlinkMbps: number | undefined = undefined;
  let rttMs: number | undefined = undefined;
  let saveData: boolean | undefined = undefined;
  let wifiSsid: string | undefined = undefined;
  let wifiBssid: string | undefined = undefined;
  let localIpAddress: string | undefined = undefined;
  let gatewayIpAddress: string | undefined = undefined;
  let wifiSignalDbm: number | undefined = undefined;
  let wifiFrequencyMhz: number | undefined = undefined;

  const limitations: string[] = [
    'Cellular radio metrics (RSRP, RSRQ, SINR, Cell ID) and low-level Wi-Fi BSSID/RSSI require native Android Telephony & WifiManager permissions not exposed in web sandboxes.',
  ];

  try {
    const androidNative = getAndroidNativeBridge();
    if (androidNative) {
      const ssid = androidNative.getWifiSsid();
      if (ssid) {
        wifiSsid = ssid;
        networkType = 'wifi';
      }

      const bssid = androidNative.getWifiBssid?.();
      if (bssid) {
        wifiBssid = bssid;
      }

      const localIp = androidNative.getLocalIpAddress?.();
      if (localIp) {
        localIpAddress = localIp;
      }

      const gateway = androidNative.getGatewayAddress?.();
      if (gateway) {
        gatewayIpAddress = gateway;
      }

      const nType = androidNative.getNetworkType();
      if (nType && nType !== 'unknown') {
        networkType = nType as NetworkType;
      }

      if (networkType === 'wifi') {
        const signal = androidNative.getWifiSignalDbm?.();
        if (typeof signal === 'number' && Number.isFinite(signal)) {
          wifiSignalDbm = signal;
        }

        const frequency = androidNative.getWifiFrequencyMhz?.();
        if (typeof frequency === 'number' && Number.isFinite(frequency)) {
          wifiFrequencyMhz = frequency;
        }
      }
    }
  } catch {}

  if (conn && networkType === 'unknown') {
    if (conn.type === 'wifi') networkType = 'wifi';
    else if (conn.type === 'cellular') networkType = 'cellular';
    else if (conn.type === 'ethernet') networkType = 'ethernet';

    effectiveType = conn.effectiveType;
    downlinkMbps = conn.downlink;
    rttMs = conn.rtt;
    saveData = conn.saveData;
  }

  // Resolve user ISP name, ASN, and geolocation via ipinfo.io and server fallback
  let ipAddress: string | undefined;
  let ispName: string | undefined;
  let asn: string | undefined;
  let asnOrg: string | undefined;
  let locationCity: string | undefined;
  let locationRegion: string | undefined;
  let locationCountry: string | undefined;

  // 0. Primary lookup: Cloudflare Trace (fastest, no auth, basic IP + country + colo)
  if (!isAndroidNativeApp()) {
    try {
      const requestTimeout = createRequestTimeout(undefined, 3_000);
      let traceRes: Response | null;
      try {
        traceRes = await fetch('/api/network/cloudflare-trace', {
          cache: 'no-store',
          signal: requestTimeout.signal,
        }).catch(() => null);
      } finally {
        requestTimeout.dispose();
      }

      if (traceRes && traceRes.ok) {
        const data = await traceRes.json();
        if (data.ok) {
          ipAddress = data.ip;
          locationCountry = data.country;
          // Still need city, region, ISP, ASN from ipinfo.io or Radar
        }
      }
    } catch {
      // Continue to Radar or ipinfo.io
    }
  }

  // 0.5. Optional: Cloudflare Radar lookup (if API token available, provides detailed info)
  if (!isAndroidNativeApp() && ipAddress && (!locationCity || !ispName || !asn)) {
    try {
      const radarConfig: CloudflareRadarConfig = {
        apiToken: import.meta.env.CLOUDFLARE_RADAR_API_TOKEN || undefined,
      };

      // Only call Radar if we have a token
      if (radarConfig.apiToken) {
        const requestTimeout = createRequestTimeout(undefined, 5_000);
        try {
          const radarData = await getIPInfoFromRadar(ipAddress, radarConfig);
          if (radarData.ok) {
            if (!locationCity) locationCity = radarData.city;
            if (!locationRegion) locationRegion = radarData.region;
            if (!locationCountry) locationCountry = radarData.country;
            if (!ispName) ispName = radarData.isp;
            if (!asn) asn = radarData.asn;
            if (!asnOrg) asnOrg = radarData.org;
          }
        } finally {
          requestTimeout.dispose();
        }
      }
    } catch {
      // Continue to ipinfo.io
    }
  }

  // 1. Primary lookup: direct ipinfo.io lookup (resolves true client edge IP & ASN)
  try {
    const requestTimeout = createRequestTimeout(undefined, 4_000);
    let ipinfoRes: Response | null;
    try {
      ipinfoRes = await fetch('https://ipinfo.io/json', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: requestTimeout.signal,
      }).catch(() => null);
    } finally {
      requestTimeout.dispose();
    }

    if (ipinfoRes && ipinfoRes.ok) {
      const data = await ipinfoRes.json();
      if (!ipAddress) ipAddress = data.ip;
      const orgStr: string = data.org || '';
      asnOrg = orgStr;

      // Extract ASN (e.g. "AS396982") and ISP (e.g. "Google LLC")
      const asnMatch = orgStr.match(/^(AS\d+)\s*(.*)$/);
      if (asnMatch) {
        asn = asnMatch[1];
        ispName = asnMatch[2] || asnMatch[1];
      } else if (orgStr.startsWith('AS')) {
        const parts = orgStr.split(' ');
        asn = parts[0];
        ispName = parts.slice(1).join(' ') || parts[0];
      } else {
        ispName = orgStr || undefined;
      }

      if (!locationCity) locationCity = data.city;
      if (!locationRegion) locationRegion = data.region;
      if (!locationCountry) locationCountry = data.country;
    }
  } catch {
    // Continue to server fallback
  }

  // 2. Free backend identity lookup: ISP + ASN + nearest M-Lab measurement server
  if (!isAndroidNativeApp()) {
    try {
      const requestTimeout = createRequestTimeout(undefined, 5_000);
      let res: Response | null;
      try {
        res = await fetch('/api/network/identity', {
          cache: 'no-store',
          signal: requestTimeout.signal,
        }).catch(() => null);
      } finally {
        requestTimeout.dispose();
      }
      if (res && res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (!ipAddress) ipAddress = data.ip;
          if (!ispName) ispName = data.isp;
          if (!asn) asn = data.asn;
          if (!asnOrg) asnOrg = data.org;
          if (!locationCity) locationCity = data.city;
          if (!locationRegion) locationRegion = data.region;
          if (!locationCountry) locationCountry = data.country;
        }
      }
    } catch {
      // fallback
    }
  }

  // 3. Secondary lookup via backend resolver /api/network/isp if client-side was blocked
  if (!isAndroidNativeApp() && (!ispName || !ipAddress)) {
    try {
      const requestTimeout = createRequestTimeout(undefined, 4_000);
      let res: Response | null;
      try {
        res = await fetch('/api/network/isp', {
          cache: 'no-store',
          signal: requestTimeout.signal,
        }).catch(() => null);
      } finally {
        requestTimeout.dispose();
      }
      if (res && res.ok) {
        const data = await res.json();
        if (data.ok) {
          if (!ipAddress) ipAddress = data.ip;
          if (!ispName) ispName = data.isp;
          if (!asn) asn = data.asn;
          if (!asnOrg) asnOrg = data.org;
          if (!locationCity) locationCity = data.city;
          if (!locationRegion) locationRegion = data.region;
          if (!locationCountry) locationCountry = data.country;
        }
      }
    } catch {
      // fallback
    }
  }

  // 4. Fallback for IP if third-party providers failed
  if (!ipAddress) {
    try {
      const requestTimeout = createRequestTimeout(undefined, 4_000);
      let res: Response | null;
      try {
        res = await fetch('https://api.ipify.org?format=json', {
          cache: 'no-store',
          signal: requestTimeout.signal,
        }).catch(() => null);
      } finally {
        requestTimeout.dispose();
      }
      if (res && res.ok) {
        const data = await res.json();
        ipAddress = data.ip;
      }
    } catch {
      // Graceful fallback if completely offline
    }
  }

  return {
    networkType,
    effectiveType,
    downlinkMbps,
    rttMs,
    saveData,
    online,
    ipAddress,
    ispName,
    asn,
    asnOrg,
    locationCity,
    locationRegion,
    locationCountry,
    wifiSsid,
    wifiBssid,
    localIpAddress,
    gatewayIpAddress,
    wifiSignalDbm,
    wifiFrequencyMhz,
    limitations,
  };
}
