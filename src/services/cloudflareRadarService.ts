/**
 * SpeedXpat — Cloudflare Radar API Service
 * Provides enhanced network analytics using Cloudflare Radar API
 * 
 * Requires optional API token from Cloudflare dashboard
 * Free tier: 5,000 requests/month
 * Rate limit: 100 requests/minute
 */

import { createRequestTimeout } from '../engines/testEndpoints';

export interface CloudflareRadarConfig {
  apiToken?: string; // Optional user-provided API key
}

export interface RadarLocation {
  country?: {
    code?: string;
    name?: string;
  };
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
}

export interface RadarASN {
  asn?: number;
  name?: string;
  domain?: string;
}

export interface RadarIPInfo {
  ip: string;
  location?: RadarLocation;
  asn?: RadarASN;
  isp?: string;
  networkType?: string;
}

export interface RadarResponse {
  ok: boolean;
  ip: string;
  country?: string;
  city?: string;
  region?: string;
  isp?: string;
  asn?: string;
  org?: string;
  loc?: string; // latitude,longitude
  networkType?: string;
  error?: string;
}

interface RadarIpEntityResponse {
  result?: {
    ip?: {
      ip?: string;
      asn?: string;
      asnName?: string;
      asnOrgName?: string;
      location?: string;
      locationName?: string;
    };
  };
  errors?: { message?: string }[];
}

/**
 * Get IP information from Cloudflare Radar API
 * Requires API token from Cloudflare dashboard
 */
export async function getIPInfoFromRadar(
  ip: string,
  config?: CloudflareRadarConfig
): Promise<RadarResponse> {
  if (!config?.apiToken) {
    return {
      ok: false,
      ip,
      error: 'Cloudflare Radar API token not configured',
    };
  }

  try {
    const url = new URL('https://api.cloudflare.com/client/v4/radar/entities/ip');
    url.searchParams.set('ip', ip);
    const requestTimeout = createRequestTimeout(undefined, 5_000);

    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Accept': 'application/json',
        },
        signal: requestTimeout.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as RadarIpEntityResponse & { success?: boolean };

        if (data.success && data.result?.ip) {
          const result = data.result.ip;

          return {
            ok: true,
            ip: result.ip || ip,
            country: result.location,
            isp: result.asnOrgName,
            asn: result.asn,
            org: result.asnOrgName || result.asnName,
          };
        }

        // Check for error in response
        if (data.errors && data.errors.length > 0) {
          return {
            ok: false,
            ip,
            error: data.errors[0].message || 'Radar API error',
          };
        }

        return { ok: false, ip, error: 'Radar API response did not contain IP details.' };
      }

      return {
        ok: false,
        ip,
        error: `Radar API request failed (status: ${res.status})`,
      };
    } finally {
      requestTimeout.dispose();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      ip,
      error: `Radar API unavailable: ${errorMessage}`,
    };
  }
}

/**
 * Get ASN information from Cloudflare Radar API
 */
export async function getASNInfoFromRadar(
  asn: string | number,
  config?: CloudflareRadarConfig
): Promise<{
  ok: boolean;
  asn: string;
  name?: string;
  domain?: string;
  error?: string;
}> {
  if (!config?.apiToken) {
    return {
      ok: false,
      asn: String(asn),
      error: 'Cloudflare Radar API token not configured',
    };
  }

  try {
    const normalizedAsn = String(asn).replace(/^AS/i, '');
    const url = `https://api.cloudflare.com/client/v4/radar/entities/asns/${encodeURIComponent(normalizedAsn)}`;
    const requestTimeout = createRequestTimeout(undefined, 5_000);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          'Accept': 'application/json',
        },
        signal: requestTimeout.signal,
      });

      if (res.ok) {
        const data = await res.json();

        if (data.success && data.result) {
          return {
            ok: true,
            asn: String(asn),
            name: data.result.asn?.name,
            domain: data.result.asn?.website,
          };
        }

        if (data.errors && data.errors.length > 0) {
          return {
            ok: false,
            asn: String(asn),
            error: data.errors[0].message || 'Radar API error',
          };
        }
      }

      return {
        ok: false,
        asn: String(asn),
        error: `Radar API request failed (status: ${res.status})`,
      };
    } finally {
      requestTimeout.dispose();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return {
      ok: false,
      asn: String(asn),
      error: `Radar API unavailable: ${errorMessage}`,
    };
  }
}

/**
 * Validate Cloudflare Radar API token
 */
export async function validateRadarAPIToken(
  token: string
): Promise<{ ok: boolean; error?: string }> {
  if (!token) {
    return { ok: false, error: 'No token provided' };
  }

  try {
    const url = 'https://api.cloudflare.com/client/v4/user/tokens/verify';
    const requestTimeout = createRequestTimeout(undefined, 5_000);

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Accept': 'application/json',
        },
        signal: requestTimeout.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          return { ok: true };
        }
        return { ok: false, error: data.errors?.[0]?.message || 'Token validation failed' };
      }

      return { ok: false, error: `Token validation failed (status: ${res.status})` };
    } finally {
      requestTimeout.dispose();
    }
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Token validation unavailable: ${errorMessage}` };
  }
}

/**
 * Get client IP from Cloudflare Trace (no auth required)
 * This is a lightweight alternative that doesn't require an API token
 */
export async function getClientIPFromTrace(signal?: AbortSignal): Promise<{
  ok: boolean;
  ip?: string;
  country?: string;
  colo?: string;
  error?: string;
}> {
  const requestTimeout = createRequestTimeout(signal, 3_000);

  try {
    const res = await fetch('https://speed.cloudflare.com/cdn-cgi/trace', {
      headers: { Accept: 'text/plain' },
      signal: requestTimeout.signal,
    });

    if (res.ok) {
      const traceText = await res.text();
      const traceData: Record<string, string> = {};

      traceText.split('\n').forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) traceData[key] = value;
      });

      return {
        ok: true,
        ip: traceData.ip,
        country: traceData.loc,
        colo: traceData.colo,
      };
    }

    return { ok: false, error: `Trace request failed (status: ${res.status})` };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: `Trace unavailable: ${errorMessage}` };
  } finally {
    requestTimeout.dispose();
  }
}
