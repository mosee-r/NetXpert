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

export async function detectNetworkInfo(): Promise<DeviceNetworkInfo> {
  const nav = navigator as NetworkInformationNavigator;
  const conn = nav.connection;

  let networkType: NetworkType = 'unknown';
  let effectiveType: string | undefined = undefined;
  let downlinkMbps: number | undefined = undefined;
  let rttMs: number | undefined = undefined;
  let saveData: boolean | undefined = undefined;
  let wifiSsid: string | undefined = undefined;

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
      const nType = androidNative.getNetworkType();
      if (nType && nType !== 'unknown') {
        networkType = nType as NetworkType;
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
  let nearestServer: {
    machine?: string;
    hostname?: string;
    city?: string;
    country?: string;
    label?: string;
  } | undefined;

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
      ipAddress = data.ip;
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

      locationCity = data.city;
      locationRegion = data.region;
      locationCountry = data.country;
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
          if (!nearestServer && data.nearestServer) {
            nearestServer = {
              machine: data.nearestServer.machine,
              hostname: data.nearestServer.hostname,
              city: data.nearestServer.city,
              country: data.nearestServer.country,
              label: data.nearestServer.label,
            };
          }
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
    online: navigator.onLine,
    ipAddress,
    ispName,
    asn,
    asnOrg,
    locationCity,
    locationRegion,
    locationCountry,
    nearestServer,
    wifiSsid,
    limitations,
  };
}
