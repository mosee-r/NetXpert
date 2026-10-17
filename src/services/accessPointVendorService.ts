const CACHE_KEY_PREFIX = 'speedxpat.access-point-vendor.';

export function getAccessPointOui(bssid?: string): string | undefined {
  if (!bssid || !/^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$|^[0-9a-f]{12}$/i.test(bssid)) {
    return undefined;
  }

  const octets = bssid.replace(/[:-]/g, '').match(/.{2}/g);
  if (!octets) return undefined;

  const firstOctet = Number.parseInt(octets[0], 16);
  if ((firstOctet & 0x03) !== 0 || octets.every((octet) => octet === '00') || octets.every((octet) => octet === 'ff')) {
    return undefined;
  }

  return octets.slice(0, 3).join('').toUpperCase();
}

export function getCachedAccessPointVendor(oui: string): string | undefined {
  try {
    const vendor = window.localStorage.getItem(`${CACHE_KEY_PREFIX}${oui}`);
    return vendor?.trim() || undefined;
  } catch (error) {
    console.warn('Unable to read cached access-point vendor:', error);
    return undefined;
  }
}

export function cacheAccessPointVendor(oui: string, vendor: string): void {
  try {
    window.localStorage.setItem(`${CACHE_KEY_PREFIX}${oui}`, vendor.trim().slice(0, 120));
  } catch (error) {
    console.warn('Unable to cache access-point vendor:', error);
  }
}
