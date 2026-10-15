export interface TestEndpoints {
  ping: string;
  download: string;
  upload: string;
}

export interface AndroidNativeBridge {
  getWifiSsid(): string;
  getNetworkType(): string;
  hasValidatedInternet?(): boolean;
  isLocationEnabled(): boolean;
  openLocationSettings(): void;
  openApplicationSettings(): void;
  scanWifiNetworks(): boolean;
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

export function getDefaultTestEndpoints(): TestEndpoints {
  return {
    ping: 'https://speed.cloudflare.com/__down?bytes=1',
    download: 'https://speed.cloudflare.com/__down',
    upload: 'https://speed.cloudflare.com/__up',
  };
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
    url.hostname === 'speed.cloudflare.com' && url.pathname === '/__down'
      ? 'bytes'
      : 'size';

  url.searchParams.set(sizeParameter, String(sizeBytes));
  for (const [key, value] of Object.entries(extraParams)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
